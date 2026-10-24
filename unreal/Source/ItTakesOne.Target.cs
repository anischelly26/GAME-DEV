using UnrealBuildTool;

public class ItTakesOneTarget : TargetRules
{
	public ItTakesOneTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("ItTakesOne");
	}
}
