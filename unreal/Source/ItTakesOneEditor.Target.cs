using UnrealBuildTool;

public class ItTakesOneEditorTarget : TargetRules
{
	public ItTakesOneEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("ItTakesOne");
	}
}
