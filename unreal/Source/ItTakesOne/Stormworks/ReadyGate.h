#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ReadyGate.generated.h"

class AHUD;

/**
 * Holds a freshly loaded level behind a black title card until it is fit to be seen: the game is
 * paused, Mara dressed, and nothing is still compiling or streaming (in an uncooked run animations,
 * textures, meshes and shaders all arrive after the level does, which is what showed a T-pose, the
 * fallback checker material and the sky's warning). Then the game starts and the card fades away.
 * It waits on those conditions, not on a fixed delay; if they never settle it gives up after
 * MaxWait and says so in the log.
 */
UCLASS()
class ITTAKESONE_API AReadyGate : public AActor
{
	GENERATED_BODY()

public:
	AReadyGate();

	static AReadyGate* Hold(UWorld* World, const FString& Title);

	/** 1 while the level is hidden, down to 0 as it fades in. */
	float GetCover() const { return Cover; }
	bool IsReady() const { return bReady; }

	/** Draws the card over everything else. */
	void DrawOn(AHUD* Hud, float SX, float SY) const;

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(EditAnywhere, Category = "Gate")
	float MaxWait = 45.f;

private:
	FString Title;
	double StartedAt = 0.0;
	float Quiet = 0.f;
	float SinceReady = 0.f;
	float Cover = 1.f;
	bool bReady = false;
};
