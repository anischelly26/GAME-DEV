#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HouseSelfTest.generated.h"

class AMaraCharacter;
class APlayerController;

/**
 * A scripted player for the house slice, started with -HouseSelfTest on the House map. It walks in
 * from the jetty, looks at the three details, inspects the gauge, watches the tentacle steal it
 * (and freeze when looked at), follows it to the teacup and the lampshade, sits through the
 * searchlight and the grab, rides the descent without steering, swims to Nacre and takes the gauge
 * back. It checks each beat and takes screenshots. Results: Saved/HouseSelfTest/results.txt, in the
 * same line format as the Stormworks self-test. A bot, not a person: it says nothing about whether
 * the tentacle is funny.
 */
UCLASS()
class ITTAKESONE_API AHouseSelfTest : public AActor
{
	GENERATED_BODY()

public:
	AHouseSelfTest();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
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
	void Log(const FString& Line);
	void Shot(const FString& Name);
	AMaraCharacter* Mara() const;
	APlayerController* PC() const;
	FVector WP(const TCHAR* Tag) const;
	bool MoveTo(const FVector& Where, float Radius);
	void AimAt(const FVector& Where);
	/** A real key, through the player controller and its input mappings. */
	void Key(const FKey& Which, bool bDown);
	void HoldW(bool bDown);
	/** Down now, up three frames later. */
	void Tap(const FKey& Which);
	/** Turns the camera straight away from a point (as seen from Mara), level. */
	void AimAway(const FVector& From);

	TArray<FStep> Steps;
	int32 Index = -1;
	float StepT = 0.f;
	float Total = 0.f;
	int32 Passed = 0;
	int32 Failed = 0;
	bool bDone = false;
	float QuitIn = -1.f;
	/** results.txt, open for the whole run (others may read it), flushed after every line. */
	TUniquePtr<FArchive> ResultsFile;
	FString OutDir;
	int32 Frames = 0;
	double FrameSum = 0.0;
	int32 FramesOver33 = 0;
	/** How her body lies, sampled in the water: see SampleBody. */
	void SampleBody();
	/** Worst cosine between (pelvis to head) and her travel while moving fast; worst bubble offset. */
	float WorstLead = 1.f;
	float WorstBubble = 0.f;
	bool bHoldingW = false;
	FKey Tapped;
	int32 TapFrames = 0;
	FKey Steering;
	float SteerRight = 0.f;
	float SteerLeft = 0.f;
	float SteerUp = 0.f;
	int32 StepFrames = 0;
	double StepSum = 0.0;
	double StepGame = 0.0;
	double StepRender = 0.0;
	double StepGpu = 0.0;
	bool bFlag = false;
	bool bRecording = false;
	bool bStopAudio = false;
	float Mark = 0.f;
};
