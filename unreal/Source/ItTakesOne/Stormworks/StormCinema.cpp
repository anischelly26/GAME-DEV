#include "Stormworks/StormCinema.h"

#include "Components/AudioComponent.h"
#include "Engine/World.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "LevelSequence.h"
#include "LevelSequenceActor.h"
#include "LevelSequencePlayer.h"
#include "Stormworks/StormworksAssets.h"

namespace
{
	const TCHAR* const ShotPaths[] = {
		TEXT("/Game/ItTakesOne/Stormworks/Cinematics/LS_SW_Opening.LS_SW_Opening"),
		TEXT("/Game/ItTakesOne/Stormworks/Cinematics/LS_SW_EngineReveal.LS_SW_EngineReveal"),
		TEXT("/Game/ItTakesOne/Stormworks/Cinematics/LS_SW_Rooftop.LS_SW_Rooftop"),
		TEXT("/Game/ItTakesOne/House/Cinematics/LS_House_Grab.LS_House_Grab"),
	};
	// Each shot's own sound, ended with the shot (the music is the game mode's).
	const TCHAR* const ShotSounds[] = {TEXT("S_TOS_Thunder"), TEXT("S_TOS_Rumble"), TEXT("S_TOS_Chime_2"), TEXT("H_Grab")};
	const TCHAR* const ShotNames[] = {TEXT("Opening"), TEXT("EngineReveal"), TEXT("Rooftop"), TEXT("HouseGrab")};
	const TCHAR* const EndNames[] = {TEXT("completed"), TEXT("skipped"), TEXT("cancelled")};
}

UStormCinema::UStormCinema()
{
	PrimaryComponentTick.bCanEverTick = false;
}

bool UStormCinema::Play(EStormShot Shot, bool bReplay)
{
	const int32 Id = static_cast<int32>(Shot);
	if (IsPlaying() || (Seen[Id] && !bReplay))
	{
		return false;
	}
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	ACharacter* C = PC ? Cast<ACharacter>(PC->GetPawn()) : nullptr;
	ULevelSequence* Sequence = LoadObject<ULevelSequence>(nullptr, ShotPaths[Id], nullptr, LOAD_NoWarn | LOAD_Quiet);
	Current = Id;
	bReplaying = bReplay;
	if (!Sequence || !PC || !C)
	{
		// No sequence in the project: the shot "plays" instantly, so the game still progresses.
		UE_LOG(LogStormworks, Warning, TEXT("Cinema: %s is missing (run build_stormworks.py); skipping it"), ShotNames[Id]);
		FinishSequenceOnce(Shot, EShotEnd::Completed);
		return false;
	}

	// She is standing still when a shot starts; take the controls until it ends.
	C->GetCharacterMovement()->StopMovementImmediately();
	C->DisableInput(PC);
	PC->SetIgnoreMoveInput(true);
	PC->SetIgnoreLookInput(true);
	bInputTaken = true;

	FMovieSceneSequencePlaybackSettings Settings;
	ALevelSequenceActor* Spawned = nullptr;
	Player = ULevelSequencePlayer::CreateLevelSequencePlayer(GetWorld(), Sequence, Settings, Spawned);
	SequenceActor = Spawned;
	Player->OnFinished.AddDynamic(this, &UStormCinema::OnPlayerFinished);
	Player->Play();
	if (USoundBase* S = Stormworks::SoundAsset(ShotSounds[Id]))
	{
		Stinger = UGameplayStatics::SpawnSound2D(this, S, 0.55f);
	}
	UE_LOG(LogStormworks, Log, TEXT("Cinema: %s plays (%.1f s)%s"), ShotNames[Id], GetLength(), bReplay ? TEXT(", a replay") : TEXT(""));
	return true;
}

float UStormCinema::GetTime() const
{
	return Player ? static_cast<float>(Player->GetCurrentTime().AsSeconds()) : 0.f;
}

float UStormCinema::GetLength() const
{
	return Player ? static_cast<float>(Player->GetDuration().AsSeconds()) : 0.f;
}

void UStormCinema::Skip()
{
	if (IsPlaying())
	{
		FinishSequenceOnce(static_cast<EStormShot>(Current), EShotEnd::Skipped);
	}
}

void UStormCinema::Cancel()
{
	if (IsPlaying())
	{
		FinishSequenceOnce(static_cast<EStormShot>(Current), EShotEnd::Cancelled);
	}
}

void UStormCinema::OnPlayerFinished()
{
	if (IsPlaying())
	{
		FinishSequenceOnce(static_cast<EStormShot>(Current), EShotEnd::Completed);
	}
}

void UStormCinema::FinishSequenceOnce(EStormShot Shot, EShotEnd Reason)
{
	const int32 Id = static_cast<int32>(Shot);
	if (Current != Id)
	{
		return;
	}
	// First of all, so nothing below (a sequencer callback while stopping) can finish it again.
	Current = -1;

	APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	APawn* Pawn = PC ? PC->GetPawn() : nullptr;
	AActor* ShotCamera = PC ? PC->GetViewTarget() : nullptr;

	if (Player)
	{
		Player->OnFinished.RemoveAll(this);
		if (Reason == EShotEnd::Skipped)
		{
			Player->GoToEndAndStop();
		}
		else
		{
			Player->Stop();
		}
	}
	if (SequenceActor)
	{
		SequenceActor->Destroy();
	}
	SequenceActor = nullptr;
	Player = nullptr;

	// The camera: from where the shot left it back to her, briefly (at once after a cancellation).
	if (PC && Pawn)
	{
		if (Reason != EShotEnd::Cancelled && ShotCamera && ShotCamera != Pawn)
		{
			PC->SetViewTarget(ShotCamera);
			PC->SetViewTargetWithBlend(Pawn, Reason == EShotEnd::Completed ? 0.8f : 0.35f, VTBlend_EaseInOut, 2.f);
		}
		else
		{
			PC->SetViewTarget(Pawn);
		}
	}
	// The controls.
	if (bInputTaken)
	{
		bInputTaken = false;
		if (PC)
		{
			PC->SetIgnoreMoveInput(false);
			PC->SetIgnoreLookInput(false);
			if (Pawn)
			{
				Pawn->EnableInput(PC);
			}
		}
	}
	// The shot's own sound.
	if (Stinger)
	{
		Stinger->FadeOut(0.4f, 0.f);
		Stinger = nullptr;
	}

	LastEnd = Reason;
	++Finishes;
	// What the shot grants, once: never on a cancellation, never on a replay of a seen shot.
	if (Reason != EShotEnd::Cancelled && !Seen[Id])
	{
		Seen[Id] = true;
		++Granted[Id];
		OnProgress.Broadcast(Shot);
	}
	UE_LOG(LogStormworks, Log, TEXT("Cinema: %s %s"), ShotNames[Id], EndNames[static_cast<int32>(Reason)]);
}

void UStormCinema::EndPlay(const EEndPlayReason::Type Reason)
{
	Cancel();
	Super::EndPlay(Reason);
}
