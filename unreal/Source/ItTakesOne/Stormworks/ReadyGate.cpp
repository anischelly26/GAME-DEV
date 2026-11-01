#include "Stormworks/ReadyGate.h"

#include "ContentStreaming.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "GameFramework/HUD.h"
#include "GameFramework/PlayerController.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "Stormworks/MaraCharacter.h"
#if WITH_EDITOR
#include "AssetCompilingManager.h"
#include "ShaderCompiler.h"
#endif

AReadyGate::AReadyGate()
{
	PrimaryActorTick.bCanEverTick = true;
	// It runs the pause, so it must tick through it.
	PrimaryActorTick.bTickEvenWhenPaused = true;
}

AReadyGate* AReadyGate::Hold(UWorld* World, const FString& Title)
{
	AReadyGate* Gate = World->SpawnActor<AReadyGate>();
	if (Gate)
	{
		Gate->Title = Title;
	}
	return Gate;
}

void AReadyGate::BeginPlay()
{
	Super::BeginPlay();
	UGameplayStatics::SetGamePaused(this, true);
}

void AReadyGate::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bReady)
	{
		// The first unpaused frames pose her and settle exposure behind the card; then it fades.
		SinceReady += DeltaSeconds;
		if (SinceReady > 0.3f)
		{
			Cover = FMath::Max(0.f, Cover - DeltaSeconds * 2.5f);
		}
		if (Cover <= 0.f)
		{
			SetActorTickEnabled(false);
		}
		return;
	}

	int32 Assets = 0;
	int32 Shaders = 0;
#if WITH_EDITOR
	Assets = FAssetCompilingManager::Get().GetNumRemainingAssets();
	Shaders = GShaderCompilingManager ? GShaderCompilingManager->GetNumRemainingJobs() : 0;
#endif
	const int32 Streaming = IStreamingManager::Get().GetNumWantingResources();
	const AMaraCharacter* Mara = Cast<AMaraCharacter>(UGameplayStatics::GetPlayerCharacter(this, 0));
	const bool bDressed = Mara && Mara->IsDressed();
	if (StartedAt <= 0.0)
	{
		// From the first frame: on a cold start that frame alone can take most of a minute.
		StartedAt = FPlatformTime::Seconds();
	}
	Quiet = bDressed && Assets == 0 && Shaders == 0 && Streaming == 0 ? Quiet + DeltaSeconds : 0.f;
	const float Waited = static_cast<float>(FPlatformTime::Seconds() - StartedAt);
	if (Quiet > 0.25f || Waited > MaxWait)
	{
		bReady = true;
		UGameplayStatics::SetGamePaused(this, false);
		if (Quiet > 0.25f)
		{
			UE_LOG(LogStormworks, Log, TEXT("Ready gate: %s opens after %.1f s"), *Title, Waited);
		}
		else
		{
			UE_LOG(LogStormworks, Warning, TEXT("Ready gate: gave up after %.0f s (dressed %d, %d assets, %d shaders, %d streaming)"), Waited, bDressed ? 1 : 0, Assets, Shaders, Streaming);
		}
	}
}

void AReadyGate::DrawOn(AHUD* Hud, float SX, float SY) const
{
	if (Cover <= 0.f || !Hud || !GEngine)
	{
		return;
	}
	Hud->DrawRect(FLinearColor(0.f, 0.f, 0.f, Cover), 0.f, 0.f, SX, SY);
	UFont* Font = GEngine->GetLargeFont();
	const float Scale = FMath::Max(SY / 1080.f, 0.8f) * 1.6f;
	float W = 0.f, H = 0.f;
	Hud->GetTextSize(Title, W, H, Font, Scale);
	Hud->DrawText(Title, FLinearColor(0.95f, 0.93f, 0.88f, Cover), (SX - W) * 0.5f, SY * 0.46f, Font, Scale);
}
