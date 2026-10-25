#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "MaraExploreGameMode.generated.h"

/**
 * The project's default game mode (DefaultEngine.ini, GlobalDefaultGameMode): walk about any level
 * as Mara, with nothing else. The chapter levels imported from the web game use it; The Stormworks
 * Escape overrides it with AStormworksGameMode.
 */
UCLASS()
class ITTAKESONE_API AMaraExploreGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AMaraExploreGameMode();
};
