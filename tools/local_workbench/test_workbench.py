"""Behavior checks for dependency execution, cache integrity and source preservation."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("workbench", Path(__file__).with_name("workbench.py"))
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


def glb(path, document=None):
    payload = json.dumps(document or {"asset": {"version": "2.0"}, "meshes": [], "animations": [{"name": "Walk"}]}).encode()
    payload += b" " * (-len(payload) % 4)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 20 + len(payload)) + struct.pack("<I4s", len(payload), b"JSON") + payload)


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "character.glb"
        glb(self.source)
        self.path = self.root / "job.json"
        self.raw = {"version": 1, "inputs": {"character": "character.glb"}, "steps": [
            {"id": "inspect", "tool": "asset.inspect_glb", "input": "character"}]}

    def tearDown(self):
        self.temp.cleanup()

    def job(self):
        w.write_json(self.path, self.raw)
        return w.load_job(self.path, self.root)

    def test_actual_container_inventory_and_invalid_length(self):
        report = w.inspect_glb(self.source)
        self.assertEqual(report["animation_names"], ["Walk"])
        self.assertEqual(report["source_sha256"], w.digest(self.source))
        self.source.write_bytes(self.source.read_bytes() + b"bad")
        with self.assertRaisesRegex(ValueError, "length"):
            w.inspect_glb(self.source)

    def test_external_resources_are_rejected_even_when_local(self):
        glb(self.source, {"asset": {"version": "2.0"}, "images": [{"uri": "texture.png"}]})
        with self.assertRaisesRegex(ValueError, "External"):
            w.inspect_glb(self.source)

    def test_sources_cannot_escape_workspace(self):
        self.raw["inputs"]["character"] = "../elsewhere.glb"
        with self.assertRaisesRegex(ValueError, "inside"):
            self.job()

    def test_arbitrary_shell_tools_rejected(self):
        self.raw["steps"][0]["tool"] = "shell.execute"
        with self.assertRaisesRegex(ValueError, "unsupported"):
            self.job()

    def test_cycles_missing_dependencies_and_duplicate_ids_rejected(self):
        self.raw["steps"][0]["depends_on"] = ["inspect"]
        with self.assertRaisesRegex(ValueError, "cycle"):
            self.job()
        self.raw["steps"][0]["depends_on"] = ["missing"]
        with self.assertRaisesRegex(ValueError, "missing"):
            self.job()
        self.raw["steps"][0]["depends_on"] = []
        self.raw["steps"].append(dict(self.raw["steps"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.job()

    def test_dependencies_sort_before_consumers(self):
        self.raw["steps"].insert(0, {"id": "front", "tool": "blender.preview", "input": "character", "depends_on": ["inspect"]})
        job = self.job()
        self.assertEqual([step["id"] for step in job["steps"]], ["inspect", "front"])
        self.assertTrue(all(step["model_request"] is None for step in w.describe_plan(job)["steps"]))

    def test_run_then_reuse_avoids_tool_execution_and_preserves_source(self):
        job = self.job()
        original = self.source.read_bytes()
        first, _ = w.run_job(job, self.root)
        self.assertEqual((first["status"], first["steps_executed"]), ("complete", 1))
        with patch.object(w, "complete_entry", side_effect=AssertionError("should reuse")):
            second, summary = w.run_job(job, self.root)
        self.assertEqual((second["cache_hits"], second["steps_executed"]), (1, 0))
        self.assertEqual(self.source.read_bytes(), original)
        self.assertIsNone(second["quota_saved"])
        self.assertIsNone(second["carbon_saved"])
        self.assertFalse(second["automatic_visual_approval"])

    def test_modified_input_and_corrupt_output_invalidate_cache(self):
        job = self.job()
        first, _ = w.run_job(job, self.root)
        Path(first["steps"][0]["artifacts"][0]).write_text("corrupt")
        second, _ = w.run_job(job, self.root)
        self.assertEqual((second["cache_hits"], second["steps_executed"]), (0, 1))
        glb(self.source, {"asset": {"version": "2.0"}, "animations": [{"name": "Run"}]})
        third, _ = w.run_job(job, self.root)
        self.assertEqual(third["cache_hits"], 0)
        self.assertNotEqual(first["source_sha256"], third["source_sha256"])

    def test_cache_artifact_traversal_rejected(self):
        directory = self.root / "cache"
        directory.mkdir()
        w.write_json(directory / "complete.json", {"artifacts": [{"name": "../character.glb", "sha256": w.digest(self.source)}]})
        self.assertIsNone(w.cached_entry(directory))

    def test_parameter_dependency_and_tool_changes_invalidate_key(self):
        step = {"tool": "blender.preview", "params": {"view": "front"}}
        base = w.step_key(step, "source1", [["dep1"]], "blender1", "runner1")
        variants = [
            w.step_key({**step, "params": {"view": "back"}}, "source1", [["dep1"]], "blender1", "runner1"),
            w.step_key(step, "source2", [["dep1"]], "blender1", "runner1"),
            w.step_key(step, "source1", [["dep2"]], "blender1", "runner1"),
            w.step_key(step, "source1", [["dep1"]], "blender2", "runner1"),
            w.step_key(step, "source1", [["dep1"]], "blender1", "runner2"),
        ]
        self.assertTrue(all(key != base for key in variants))

    def test_four_previews_batched_and_failure_is_not_cached(self):
        for view in ("front", "back", "left", "right"):
            self.raw["steps"].append({"id": view, "tool": "blender.preview", "input": "character", "depends_on": ["inspect"], "params": {"view": view}})
        self.raw["steps"].append({"id": "sheet", "tool": "ffmpeg.contact_sheet", "depends_on": ["front", "back", "left", "right"]})
        job = self.job()
        calls = []

        def fake_launch(args, log, timeout, completion=None):
            calls.append(args)
            log.write_text("bounded local log")
            if args[0] == "blender":
                request = w.read_json(args[-1])
                self.assertEqual(len(request["steps"]), 4)
                for step in request["steps"]:
                    Path(step["output"]).write_bytes(b"fixture-preview")
                    w.write_json(step["receipt"], {"geometry_before": "same", "geometry_after": "same"})
            else:
                Path(args[-1]).write_bytes(b"fixture-contact-sheet")
            return .1

        with patch.object(w, "executable", side_effect=lambda explicit, name, workspace: {"path": name, "sha256": name}), patch.object(w, "launch", side_effect=fake_launch):
            report, _ = w.run_job(job, self.root)
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["blender_batches"], 1)
        self.assertEqual(len(calls), 2)
        self.assertEqual(report["next_decision"], "visual_review")
        # One changed preview should execute alone; unchanged siblings remain cached.
        self.raw["steps"][1]["params"]["samples"] = 17
        revised = self.job()
        with patch.object(w, "executable", side_effect=lambda explicit, name, workspace: {"path": name, "sha256": name}), patch.object(w, "launch", side_effect=RuntimeError("tool failed")):
            failed, _ = w.run_job(revised, self.root)
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["cache_hits"], 4)
        self.assertEqual(failed["next_decision"], "repair_failed_step")

    def test_context_is_bounded_without_claiming_automatic_model_selection(self):
        report, _ = w.run_job(self.job(), self.root)
        report['error'] = 'A' * 20000
        report['next_decision'] = 'repair_failed_step'
        report['steps'] = [{'tool': 'ffmpeg.contact_sheet', 'artifacts': ['x' * 2000]}] * 100
        packet = w.context_packet(report)
        self.assertLessEqual(packet['summary_utf8_bytes'], 4096)
        self.assertFalse(packet['summary']['automatic_model_selection'])
        self.assertIsNone(packet['summary']['quota_saved'])
        self.assertEqual(packet['summary']['model_api_calls_by_runner'], 0)


if __name__ == "__main__":
    unittest.main()
