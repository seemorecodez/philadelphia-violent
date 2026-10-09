"""Local, dependency-aware asset jobs. No model API calls or arbitrary shell tasks.

Copyright (c) 2026 SeemoreCodez. MIT; see the repository LICENSE.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
TOOLS = {"asset.inspect_glb", "blender.preview", "ffmpeg.contact_sheet"}
VIEWS = {"front", "back", "left", "right"}


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def contained(path, root):
    result, root = Path(path).resolve(), Path(root).resolve()
    if not result.is_relative_to(root):
        raise ValueError(f"Path must remain inside {root}: {result}")
    return result


def load_job(path, workspace):
    path = contained(path, workspace)
    job = read_json(path)
    if job.get("version") != 1:
        raise ValueError("Job version must be 1.")
    raw_inputs = job.get("inputs", {})
    if not isinstance(raw_inputs, dict) or not 1 <= len(raw_inputs) <= 32:
        raise ValueError("Between 1 and 32 named local inputs are required.")
    inputs = {}
    for name, value in raw_inputs.items():
        if not isinstance(value, str):
            raise ValueError("Input paths must be strings relative to the job file.")
        source = contained(path.parent / value, workspace)
        if not source.is_file() or source.suffix.lower() != ".glb":
            raise ValueError("This adapter version accepts self-contained GLB source files.")
        if source.stat().st_size > 1024 ** 3:
            raise ValueError("The first version limits each source file to 1 GiB.")
        inputs[name] = source
    steps = job.get("steps")
    if not isinstance(steps, list) or not 1 <= len(steps) <= 100:
        raise ValueError("A job must contain 1 to 100 steps.")
    by_id = {}
    for raw in steps:
        if not isinstance(raw, dict):
            raise ValueError("Each step must be an object.")
        step = dict(raw)
        name = step.get("id", "")
        if not isinstance(name, str) or not name or len(name) > 64 or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for c in name):
            raise ValueError("Step IDs use lowercase letters, digits, underscores and hyphens.")
        if name in by_id or step.get("tool") not in TOOLS:
            raise ValueError("Duplicate step ID or unsupported tool; shell commands are not accepted.")
        deps = step.setdefault("depends_on", [])
        if not isinstance(deps, list) or any(not isinstance(dep, str) for dep in deps) or len(set(deps)) != len(deps):
            raise ValueError("Dependencies must be distinct step IDs.")
        params = step.setdefault("params", {})
        if not isinstance(params, dict):
            raise ValueError("Step params must be an object.")
        if step["tool"] != "ffmpeg.contact_sheet" and step.get("input") not in inputs:
            raise ValueError(f"Missing named input for {name}.")
        if step["tool"] == "blender.preview":
            if set(params) - {"view", "size", "samples"}:
                raise ValueError("Unsupported preview parameter.")
            if params.get("view", "front") not in VIEWS:
                raise ValueError("Preview view must be front, back, left or right.")
            for key, default, minimum, maximum in [("size", 512, 128, 1024), ("samples", 16, 1, 64)]:
                value = params.get(key, default)
                if type(value) is not int or not minimum <= value <= maximum:
                    raise ValueError(f"{key} must be an integer between {minimum} and {maximum}.")
                params[key] = value
            params.setdefault("view", "front")
        elif params:
            raise ValueError(f"{step['tool']} does not accept parameters in version 1.")
        by_id[name] = step
    ordered = []
    pending = dict(by_id)
    while pending:
        ready = [step for step in pending.values() if all(dep in {s['id'] for s in ordered} for dep in step['depends_on'])]
        if not ready:
            raise ValueError("Dependency cycle or missing dependency.")
        for step in ready:
            ordered.append(step)
            del pending[step["id"]]
    for step in ordered:
        if step["tool"] == "ffmpeg.contact_sheet":
            deps = step["depends_on"]
            if len(deps) != 4 or any(by_id[dep]["tool"] != "blender.preview" for dep in deps):
                raise ValueError("Contact sheets require exactly four Blender preview dependencies.")
            if len({by_id[dep]["params"]["size"] for dep in deps}) != 1:
                raise ValueError("Contact-sheet previews must have the same size.")
    return {"name": str(job.get("name", path.stem))[:120], "inputs": inputs, "steps": ordered}


def inspect_glb(source):
    """Inspect the actual container and embedded dependencies without loading Blender."""
    source = Path(source)
    with source.open("rb") as stream:
        header = stream.read(12)
        if len(header) != 12:
            raise ValueError("Truncated GLB header.")
        magic, version, length = struct.unpack("<4sII", header)
        if magic != b"glTF" or version != 2 or length != source.stat().st_size:
            raise ValueError("Invalid GLB v2 header or declared length.")
        chunks = []
        document = None
        while stream.tell() < length:
            chunk_header = stream.read(8)
            if len(chunk_header) != 8:
                raise ValueError("Truncated GLB chunk header.")
            size, kind = struct.unpack("<I4s", chunk_header)
            if size % 4 or size > length - stream.tell():
                raise ValueError("Invalid GLB chunk length.")
            payload = stream.read(size)
            if kind == b"JSON":
                if document is not None or chunks:
                    raise ValueError("GLB JSON must be the first and only JSON chunk.")
                document = json.loads(payload.decode("utf-8").rstrip(" \x00"))
            chunks.append({"kind": kind.decode("ascii", errors="replace"), "bytes": size, "sha256": hashlib.sha256(payload).hexdigest()})
    if document is None:
        raise ValueError("GLB has no JSON document.")
    for item in document.get("buffers", []) + document.get("images", []):
        uri = item.get("uri")
        if uri and not uri.startswith("data:"):
            raise ValueError("External GLB resources are not supported; embed them before using the cache.")
    accessors = document.get("accessors", [])
    primitive_count = 0
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive_count += 1
            if primitive.get("mode", 4) == 4:
                index = primitive.get("indices", primitive.get("attributes", {}).get("POSITION"))
                if index is not None:
                    triangles += accessors[index]["count"] // 3
    return {
        "source_sha256": digest(source), "source_bytes": source.stat().st_size,
        "meshes": len(document.get("meshes", [])), "primitives": primitive_count,
        "triangles_declared": triangles, "materials": len(document.get("materials", [])),
        "images": len(document.get("images", [])), "skins": len(document.get("skins", [])),
        "animation_names": [a.get("name", f"animation-{i}") for i, a in enumerate(document.get("animations", []))],
        "chunks": chunks, "external_resources": False,
        "precision_claim": "Container inventory only; no visual fidelity or geometry equivalence inferred.",
    }


def executable(explicit, name, workspace):
    value = explicit or shutil.which(name)
    if not value and name == "blender":
        hint = workspace / "artifacts/blender-runtime.json"
        if hint.is_file():
            value = read_json(hint).get("binary")
            # Microsoft Store Blender's supported entry point is its launcher.
            # Direct execution of the companion blender.exe can be denied.
            if value and "WindowsApps" in Path(value).parts:
                launcher = Path(value).with_name("blender-launcher.exe")
                if launcher.is_file():
                    value = str(launcher)
    if not value and name == "ffmpeg":
        try:
            import imageio_ffmpeg
            value = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass
    if not value or not Path(value).is_file():
        raise ValueError(f"{name} was not found. Supply --{name} with an installed executable path.")
    path = Path(value).resolve()
    identity = {"path": str(path), "sha256": digest(path)}
    if name == "blender" and path.name.lower() == "blender-launcher.exe":
        identity["engine_sha256"] = digest(path.with_name("blender.exe"))
    return identity


def step_key(step, source_hash, dependencies, tool_identity, implementation):
    return fingerprint({"schema": 1, "tool": step["tool"], "params": step["params"],
        "input": source_hash, "dependencies": dependencies, "executable": tool_identity,
        "implementation": implementation})


def cached_entry(directory):
    try:
        data = read_json(directory / "complete.json")
        artifacts = data["artifacts"]
        if not artifacts:
            return None
        for item in artifacts:
            target = contained(directory / item["name"], directory)
            if not target.is_file() or digest(target) != item["sha256"]:
                return None
        return data
    except (OSError, ValueError, KeyError, TypeError):
        return None


def complete_entry(directory, artifact_paths, elapsed, details):
    entry = {"artifacts": [{"name": p.name, "sha256": digest(p), "bytes": p.stat().st_size} for p in artifact_paths],
             "elapsed_seconds": round(elapsed, 4), "details": details}
    write_json(directory / "complete.json", entry)
    return entry


def launch(args, log, timeout, completion=None):
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    started = time.perf_counter()
    with log.open("wb") as output:
        result = subprocess.run(args, stdout=output, stderr=subprocess.STDOUT, timeout=timeout,
                                creationflags=flags, shell=False)
    if result.returncode:
        raise RuntimeError(f"Local tool exited {result.returncode}; see {log}")
    # Store launchers may exit before Blender. The worker emits its own receipt
    # and has a process-local deadline, so no unrelated Blender is terminated.
    if completion:
        while not completion.is_file():
            if time.perf_counter() - started > timeout + 5:
                raise TimeoutError(f"Blender completion receipt timed out; see {log}")
            time.sleep(.2)
        receipt = read_json(completion)
        if receipt.get("status") != "complete":
            raise RuntimeError(f"Blender worker failed: {receipt.get('error', 'no error detail')}; see {completion}")
    return time.perf_counter() - started


def describe_plan(job):
    return {"name": job["name"], "steps": [{"id": s["id"], "tool": s["tool"], "depends_on": s["depends_on"],
        "execution": "local deterministic tool", "model_request": None} for s in job["steps"]],
        "review": "A person or visual-capable model must inspect previews before promotion.",
        "source_edits": False, "network_calls": False, "automatic_model_routing": False}


def context_packet(report, max_bytes=4096):
    """Select the next decision's context, leaving full evidence on disk.

    Suggested capabilities are advisory. No model settings or account limits
    are changed, and no extra agents or paid requests are created.
    """
    summary = {key: report[key] for key in ["status", "requested_steps", "cache_hits", "steps_executed", "blender_batches",
        "wall_seconds", "raw_log_bytes", "next_decision", "report_path"]}
    summary["source_bytes_preserved"] = all(report["source_bytes_preserved"].values())
    summary["source_count"] = len(report["source_bytes_preserved"])
    if report["error"]:
        summary["error"] = report["error"][:1000]
    summary["artifacts"] = [s["artifacts"][0] for s in report["steps"] if s["tool"] == "ffmpeg.contact_sheet"][:2]
    summary["model_api_calls_by_runner"] = 0
    summary["quota_saved"] = None
    summary["energy_kwh"] = None
    summary["suggested_review_capability"] = {
        "visual_review": "person or vision-capable model; compare appearance against references",
        "repair_failed_step": "focused tool diagnosis; inspect the failed step evidence first",
        "inspect_report": "no model required for deterministic counts; interpretation remains optional",
    }[report["next_decision"]]
    summary["automatic_model_selection"] = False
    text = json.dumps(summary, separators=(",", ":"), ensure_ascii=False)
    while len(text.encode()) > max_bytes and summary["artifacts"]:
        summary["artifacts"].pop()
        text = json.dumps(summary, separators=(",", ":"), ensure_ascii=False)
    if len(text.encode()) > max_bytes:
        summary.pop("error", None)
        summary["details_omitted"] = "Open the report path for full failure details."
        text = json.dumps(summary, separators=(",", ":"), ensure_ascii=False)
    if len(text.encode()) > max_bytes:
        raise ValueError("Context budget too small for the report locator; use at least 4096 bytes.")
    return {"summary": summary, "summary_utf8_bytes": len(text.encode()),
        "max_summary_utf8_bytes": max_bytes, "token_estimate_not_billing": math.ceil(len(text.encode()) / 4)}


def run_job(job, workspace, *, blender=None, ffmpeg=None, timeout=180, run_root=None):
    start = time.perf_counter()
    root = contained(run_root or workspace / "artifacts/local-workbench", workspace)
    run_dir = contained(root / "runs" / (time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]), root)
    run_dir.mkdir(parents=True, exist_ok=False)
    source_hashes = {name: digest(path) for name, path in job["inputs"].items()}
    identities = {}
    implementation = fingerprint({"runner": digest(Path(__file__)), "blender_worker": digest(HERE / "blender_worker.py")})
    records, completed = [], {}
    log_paths = []
    batch_count = 0
    status, error = "complete", None

    def unchanged():
        for name, path in job["inputs"].items():
            if digest(path) != source_hashes[name]:
                raise RuntimeError(f"Source changed while the job ran: {path}")

    def prepare(step):
        kind = step["tool"].split(".")[0]
        if kind not in identities:
            identities[kind] = {"implementation": "stdlib GLB v2 reader"} if kind == "asset" else executable(blender if kind == "blender" else ffmpeg, kind, workspace)
        deps = [[a["sha256"] for a in completed[dep]["entry"]["artifacts"]] for dep in step["depends_on"]]
        key = step_key(step, source_hashes.get(step.get("input")), deps, identities[kind], implementation)
        directory = contained(root / "cache" / key, root)
        directory.mkdir(parents=True, exist_ok=True)
        return directory, cached_entry(directory)

    def remember(step, directory, entry, hit):
        completed[step["id"]] = {"directory": directory, "entry": entry}
        records.append({"id": step["id"], "tool": step["tool"], "cache_hit": hit,
            "artifacts": [str(directory / a["name"]) for a in entry["artifacts"]]})

    try:
        # Reject external resources before launching any application, including cached work.
        for source in job["inputs"].values():
            inspect_glb(source)
        pending = list(job["steps"])
        while pending:
            ready = [s for s in pending if all(dep in completed for dep in s["depends_on"])]
            misses = []
            for step in ready:
                directory, entry = prepare(step)
                if entry:
                    remember(step, directory, entry, True)
                    pending.remove(step)
                else:
                    misses.append((step, directory))
            if not misses:
                continue
            previews = [(s, d) for s, d in misses if s["tool"] == "blender.preview"]
            if previews:
                batch_count += 1
                request_path = run_dir / f"blender-batch-{batch_count}.json"
                payload = [{"id": s["id"], "source": str(job["inputs"][s["input"]]),
                    "output": str(d / "preview.png"), "receipt": str(d / "preview.json"), **s["params"]} for s, d in previews]
                completion = run_dir / f"blender-batch-{batch_count}-complete.json"
                write_json(request_path, {"steps": payload, "completion": str(completion), "timeout_seconds": timeout})
                log = run_dir / f"blender-batch-{batch_count}.log"
                log_paths.append(log)
                elapsed = launch([identities["blender"]["path"], "--background", "--factory-startup", "--disable-autoexec",
                    "--threads", "2", "--python-exit-code", "1", "--python", str(HERE / "blender_worker.py"),
                    "--", str(request_path)], log, timeout, completion=completion)
                unchanged()
                for step, directory in previews:
                    receipt = read_json(directory / "preview.json")
                    if receipt["geometry_before"] != receipt["geometry_after"]:
                        raise RuntimeError("Preview processing changed imported geometry.")
                    entry = complete_entry(directory, [directory / "preview.png", directory / "preview.json"],
                        elapsed / len(previews), {"render_only": True, "batch_seconds": elapsed,
                            "timing_scope": "Batch time divided across previews; not individual render timing."})
                    remember(step, directory, entry, False)
                    pending.remove(step)
            for step, directory in misses:
                if step["tool"] == "blender.preview":
                    continue
                started = time.perf_counter()
                if step["tool"] == "asset.inspect_glb":
                    output = directory / "inspection.json"
                    write_json(output, inspect_glb(job["inputs"][step["input"]]))
                    details = {"inspection_only": True}
                else:
                    frames = [completed[dep]["directory"] / "preview.png" for dep in step["depends_on"]]
                    output = directory / "contact-sheet.png"
                    log = run_dir / (step["id"] + ".log")
                    log_paths.append(log)
                    args = [identities["ffmpeg"]["path"], "-hide_banner", "-nostdin", "-y"]
                    for frame in frames:
                        args += ["-i", str(frame)]
                    args += ["-filter_complex_threads", "1", "-filter_complex",
                        "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[out]",
                        "-map", "[out]", "-frames:v", "1", "-threads", "2", "-update", "1", str(output)]
                    launch(args, log, timeout)
                    details = {"source_order": step["depends_on"], "generated_animation": False}
                unchanged()
                entry = complete_entry(directory, [output], time.perf_counter() - started, details)
                remember(step, directory, entry, False)
                pending.remove(step)
        unchanged()
    except Exception as exc:
        status, error = "failed", str(exc)
    preservation = {name: digest(path) == source_hashes[name] if path.is_file() else False for name, path in job["inputs"].items()}
    if not all(preservation.values()):
        status = "failed"
        error = error or "Source preservation check failed."
    report = {
        "version": 1, "job": job["name"], "status": status, "error": error,
        "steps": records, "requested_steps": len(job["steps"]),
        "cache_hits": sum(s["cache_hit"] for s in records),
        "steps_executed": sum(not s["cache_hit"] for s in records), "blender_batches": batch_count,
        "wall_seconds": round(time.perf_counter() - start, 4),
        "source_sha256": source_hashes, "source_bytes_preserved": preservation,
        "raw_log_bytes": sum(p.stat().st_size for p in log_paths if p.exists()),
        "model_api_calls_by_runner": 0, "quota_saved": None, "energy_kwh": None, "carbon_saved": None,
        "measurement_limits": "No account-quota meter or energy meter. Cache counts are not quota/carbon measurements.",
        "next_decision": "visual_review" if status == "complete" and any(s["tool"] == "blender.preview" for s in job["steps"]) else ("inspect_report" if status == "complete" else "repair_failed_step"),
        "automatic_visual_approval": False, "report_path": str(run_dir / "report.json"),
    }
    write_json(run_dir / "report.json", report)
    packet = context_packet(report)
    write_json(run_dir / "context-packet.json", packet)
    return report, packet["summary"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["plan", "run"])
    parser.add_argument("job", type=Path)
    parser.add_argument("--workspace", type=Path, default=HERE.parents[1])
    parser.add_argument("--blender")
    parser.add_argument("--ffmpeg")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    try:
        workspace = args.workspace.resolve()
        if not 10 <= args.timeout <= 600:
            raise ValueError("Timeout must be between 10 and 600 seconds per application invocation.")
        job = load_job(args.job.resolve(), workspace)
        if args.command == "plan":
            print(json.dumps(describe_plan(job), indent=2))
            return 0
        report, summary = run_job(job, workspace, blender=args.blender, ffmpeg=args.ffmpeg, timeout=args.timeout)
        print(json.dumps(summary, indent=2))
        return 0 if report["status"] == "complete" else 1
    except Exception as exc:
        print(json.dumps({"status": "invalid", "error": str(exc)}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
