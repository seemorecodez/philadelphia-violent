using UnrealBuildTool;
public class PhiladelphiaTarget : TargetRules
{
    public PhiladelphiaTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("Philadelphia");
    }
}
