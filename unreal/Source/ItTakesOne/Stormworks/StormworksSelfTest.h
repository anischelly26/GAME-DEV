#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StormworksSelfTest.generated.h"

class ACharacter;
class APlayerController;
class ATetherPoint;
enum class EShotEnd : uint8;
enum class EStormShot : uint8;

/**
 * A scripted player for The Stormworks Escape, started with `-StormSelfTest`. It plays the
 * sequence through the character's own movement, the camera's aim and the tether's button (no
 * teleports except where a test says so), checks what should happen at each beat, takes
 * screenshots of ordinary gameplay views, then quits. Results: Saved/StormworksSelfTest/results.txt.
 *
 * Covered: the start, the pickup, the first pull, repeating and returning to an interaction, a ring
 * that is too far, repositioning the crate and crossing, a missed jump and the recovery, the
 * coupling and its consequences, a deliberate fall on the collapsing catwalk and its reset, the
 * full climax, the final note, restarting from the checkpoint, and not being stuck at the end.
 * It is a bot, not a person: it says nothing about how the sequence feels.
 */
UCLASS()
class ITTAKESONE_API AStormworksSelfTest : public AActor
{
	GENERATED_BODY()

public:
	AStormworksSelfTest();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	struct FStep
	{
		FString Name;
		TFunction<void()> Start;
		TFunction<bool(float)> Update;
		float Timeout = 20.f;
	};

	void Build();
	void Check(bool bOk, const FString& What);
	/** After a cinematic: ended for this reason, granted exactly once, camera and controls back. */
	void CheckShotEnd(EStormShot Shot, EShotEnd Reason, const TCHAR* What);
	void Log(const FString& Line);
	void Shot(const FString& Name);

	ACharacter* Char() const;
	APlayerController* PC() const;
	FVector WP(const FName& Tag) const;
	ATetherPoint* Ring(const FName& Tag) const;
	AActor* Tagged(const FName& Tag) const;
	bool MoveTo(const FVector& Where, float Radius = 60.f);
	void AimAt(const FVector& Where);
	void Stop();

	TArray<FStep> Steps;
	int32 Index = -1;
	float StepT = 0.f;
	float Total = 0.f;
	int32 Passed = 0;
	int32 Failed = 0;
	FString OutDir;
	FString Results;
	bool bDone = false;
	float QuitIn = -1.f;
	// Scratch state for steps.
	int32 Count0 = 0;
	float Mark = 0.f;
	float LogMark = 0.f;
	bool bFlag = false;
	FVector Pos0 = FVector::ZeroVector;
	// Frame times while the route plays (after shaders are ready).
	int32 Frames = 0;
	float FrameSum = 0.f;
	float FrameWorst = 0.f;
	int32 FramesOver33 = 0;
	float ShaderWaitLog = 0.f;
	// -StormClip: a burst of frames through the climax, for a short clip.
	bool bClip = false;
	int32 ClipFrames = 0;
	float ClipNext = 0.f;
};
