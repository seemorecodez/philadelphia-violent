using UnrealBuildTool;
public class Philadelphia : ModuleRules
{
    public Philadelphia(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "PhysicsCore", "Json", "ProceduralMeshComponent", "RHI" });
    }
}
