using UnrealBuildTool;
public class PhiladelphiaEditorTarget : TargetRules
{
    public PhiladelphiaEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("Philadelphia");
    }
}
