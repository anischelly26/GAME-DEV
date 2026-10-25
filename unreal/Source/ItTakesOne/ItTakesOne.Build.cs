using UnrealBuildTool;

public class ItTakesOne : ModuleRules
{
	public ItTakesOne(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		// Sources include each other as "Stormworks/X.h" and "ItTakesOne.h", relative to the module.
		PublicIncludePaths.Add(ModuleDirectory);
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "CableComponent", "AssetRegistry", "LevelSequence", "MovieScene", "RenderCore", "RHI" });
	}
}
