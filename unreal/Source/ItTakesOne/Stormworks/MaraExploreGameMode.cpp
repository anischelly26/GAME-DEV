#include "Stormworks/MaraExploreGameMode.h"

#include "GameFramework/PlayerController.h"
#include "Stormworks/MaraCharacter.h"

AMaraExploreGameMode::AMaraExploreGameMode()
{
	DefaultPawnClass = AMaraCharacter::StaticClass();
	PlayerControllerClass = APlayerController::StaticClass();
}
