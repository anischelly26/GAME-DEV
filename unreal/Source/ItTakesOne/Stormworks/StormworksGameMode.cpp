#include "Stormworks/StormworksGameMode.h"

#include "Camera/PlayerCameraManager.h"
#include "EngineUtils.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/PackageName.h"
#include "Stormworks/MaraCharacter.h"
#include "Stormworks/ReadyGate.h"
#include "Stormworks/StormCheckpoint.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormMusic.h"
#include "Stormworks/StormDirector.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/StormworksHUD.h"
#include "Stormworks/StormworksSelfTest.h"
#include "Stormworks/StoryNote.h"
#include "Stormworks/TetherComponent.h"
#include "Stormworks/WorkshopToy.h"

namespace
{
	// The next part of the story (tools/unreal/build_house.py builds it).
	const TCHAR* HouseMap = TEXT("/Game/ItTakesOne/Maps/House");
}

AStormworksGameMode::AStormworksGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	HUDClass = AStormworksHUD::StaticClass();
	Cinema = CreateDefaultSubobject<UStormCinema>(TEXT("Cinema"));
	Music = CreateDefaultSubobject<UStormMusic>(TEXT("Music"));

	// Mara (her own character class: the template's movement, camera and controls, nothing from
	// the template's content) and a plain player controller.
	DefaultPawnClass = AMaraCharacter::StaticClass();
	PlayerControllerClass = APlayerController::StaticClass();
}

void AStormworksGameMode::StartPlay()
{
	Super::StartPlay();
	StartTime = GetWorld()->GetTimeSeconds();

	// The first checkpoint is where the sequence starts.
	for (TActorIterator<AStormCheckpoint> It(GetWorld()); It; ++It)
	{
		if (!Checkpoint || It->Order < Checkpoint->Order)
		{
			Checkpoint = *It;
		}
	}
	if (Checkpoint && !Checkpoint->Objective.IsEmpty())
	{
		SetObjective(Checkpoint->Objective);
	}
	Gate = AReadyGate::Hold(GetWorld(), TEXT("It Only Needs Mara"));
	Cinema->OnProgress.AddUObject(this, &AStormworksGameMode::OnShotProgress);
	// The opening plays as soon as she is there (the self-test plays it itself, when it is ready).
	bOpeningPending = !FParse::Param(FCommandLine::Get(), TEXT("StormSelfTest"));
	// For a bot: straight on to the house, by the same road as the game (with -HouseSelfTest).
	if (FParse::Param(FCommandLine::Get(), TEXT("StormChainTest")))
	{
		bOpeningPending = false;
		ContinueIn = 0.1f;
	}

	// Load every sound now, so the first tug or swing does not stall on a disk read.
	for (const TCHAR* Name : {TEXT("S_TOS_Fire"), TEXT("S_TOS_Latch"), TEXT("S_TOS_Reel"), TEXT("S_TOS_Refuse"), TEXT("S_TOS_Grind"), TEXT("S_TOS_Clunk"),
							  TEXT("S_TOS_Land"), TEXT("S_TOS_Creak"), TEXT("S_TOS_Crash"), TEXT("S_TOS_Rumble"), TEXT("S_TOS_Alarm"), TEXT("S_TOS_EngineStart"),
							  TEXT("S_TOS_Thunder"), TEXT("S_TOS_Pickup"), TEXT("S_TOS_Checkpoint"), TEXT("S_TOS_Complete"), TEXT("S_TOS_Paper"), TEXT("S_TOS_Splash")})
	{
		if (UObject* S = LoadObject<UObject>(nullptr, *FString::Printf(TEXT("/Game/ItTakesOne/Stormworks/Audio/%s.%s"), Name, Name), nullptr, LOAD_NoWarn | LOAD_Quiet))
		{
			Preloaded.Add(S);
		}
	}

	if (FParse::Param(FCommandLine::Get(), TEXT("StormSelfTest")))
	{
		GetWorld()->SpawnActor<AStormworksSelfTest>();
	}
}

void AStormworksGameMode::RestartPlayer(AController* NewPlayer)
{
	Super::RestartPlayer(NewPlayer);
	if (ACharacter* C = NewPlayer ? Cast<ACharacter>(NewPlayer->GetPawn()) : nullptr)
	{
		if (!C->FindComponentByClass<UTetherComponent>())
		{
			UTetherComponent* T = NewObject<UTetherComponent>(C, TEXT("Tether"));
			T->RegisterComponent();
		}
		if (Checkpoint)
		{
			C->TeleportTo(Checkpoint->GetSpawnLocation(), Checkpoint->GetActorRotation());
			NewPlayer->SetControlRotation(Checkpoint->GetActorRotation());
		}
	}
}

ACharacter* AStormworksGameMode::GetPlayerCharacter() const
{
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	return PC ? Cast<ACharacter>(PC->GetPawn()) : nullptr;
}

UTetherComponent* AStormworksGameMode::GetTether() const
{
	ACharacter* C = GetPlayerCharacter();
	return C ? C->FindComponentByClass<UTetherComponent>() : nullptr;
}

AStormDirector* AStormworksGameMode::GetDirector() const
{
	for (TActorIterator<AStormDirector> It(GetWorld()); It; ++It)
	{
		return *It;
	}
	return nullptr;
}

void AStormworksGameMode::SetObjective(const FString& Text)
{
	if (Text != Objective)
	{
		Objective = Text;
		UE_LOG(LogStormworks, Log, TEXT("Objective: %s"), *Text);
	}
}

void AStormworksGameMode::ShowMessage(const FString& Text, float Seconds)
{
	Message = Text;
	MessageLeft = Seconds;
	MessageDuration = Seconds;
}

void AStormworksGameMode::ReachCheckpoint(AStormCheckpoint* Point)
{
	if (!Point || (Checkpoint && Point->Order <= Checkpoint->Order))
	{
		return;
	}
	Checkpoint = Point;
	if (!Point->Objective.IsEmpty())
	{
		SetObjective(Point->Objective);
	}
	if (Point->Order > 0)
	{
		ShowMessage(Point->Label.IsEmpty() ? TEXT("Checkpoint") : FString::Printf(TEXT("Checkpoint: %s"), *Point->Label), 2.f);
		Stormworks::Sound2D(this, TEXT("S_TOS_Checkpoint"), 0.6f);
	}
	if (Point->Order == 1)
	{
		Music->SetMood(EStormMood::Gallery);
	}
	else if (Point->Order == 4)
	{
		// The roof: she has landed and stands still; the view is hers for a moment.
		Cinema->Play(EStormShot::Rooftop);
	}
	UE_LOG(LogStormworks, Log, TEXT("Checkpoint %d (%s)"), Point->Order, *Point->Label);
}

void AStormworksGameMode::Respawn(bool bFell)
{
	ACharacter* C = GetPlayerCharacter();
	if (!C || !Checkpoint)
	{
		return;
	}
	// A cinematic cut short by a restart grants nothing; the music dips and carries on.
	Cinema->Cancel();
	Music->Duck();
	if (UTetherComponent* T = GetTether())
	{
		T->ResetTether();
	}
	CloseNote();
	C->GetCharacterMovement()->StopMovementImmediately();
	C->GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	C->TeleportTo(Checkpoint->GetSpawnLocation(), Checkpoint->GetActorRotation(), false, true);
	if (AController* Ctl = C->GetController())
	{
		Ctl->SetControlRotation(Checkpoint->GetActorRotation());
	}
	++Respawns;
	if (bFell)
	{
		++Falls;
		Stormworks::Sound2D(this, TEXT("S_TOS_Splash"), 0.8f);
	}
	Fade = 1.f;
	if (AStormDirector* D = GetDirector())
	{
		D->OnRespawn(Checkpoint);
	}
	UE_LOG(LogStormworks, Log, TEXT("Respawn at checkpoint %d (%s)"), Checkpoint->Order, bFell ? TEXT("fell") : TEXT("restart"));
}

void AStormworksGameMode::StormRestart()
{
	Respawn(false);
}

AStoryNote* AStormworksGameMode::NoteInReach(const ACharacter* Who) const
{
	if (!Who)
	{
		return nullptr;
	}
	const APlayerController* PC = Cast<APlayerController>(Who->GetController());
	const FVector View = PC && PC->PlayerCameraManager ? PC->PlayerCameraManager->GetCameraRotation().Vector() : Who->GetActorForwardVector();
	AStoryNote* Best = nullptr;
	float BestDist = 260.f;
	for (TActorIterator<AStoryNote> It(GetWorld()); It; ++It)
	{
		const FVector To = It->GetActorLocation() - Who->GetActorLocation();
		const float Dist = To.Size();
		if (Dist < BestDist && FVector::DotProduct(View.GetSafeNormal2D(), To.GetSafeNormal2D()) > 0.35f)
		{
			Best = *It;
			BestDist = Dist;
		}
	}
	return Best;
}

void AStormworksGameMode::OnShotProgress(EStormShot Shot)
{
	switch (Shot)
	{
	case EStormShot::Opening:
		Music->SetMood(EStormMood::Workshop);
		ShowMessage(TEXT("Ivo's workshop. The lamp on Knoll Rock is burning."), 3.5f);
		break;
	case EStormShot::EngineReveal:
		if (AStormDirector* D = GetDirector())
		{
			SetObjective(D->EngagedObjective);
		}
		Music->SetMood(EStormMood::Escape);
		break;
	case EStormShot::Rooftop:
		Music->SetMood(EStormMood::Rooftop);
		break;
	default:
		break;
	}
}

AWorkshopToy* AStormworksGameMode::ToyInReach(const ACharacter* Who) const
{
	if (!Who)
	{
		return nullptr;
	}
	const APlayerController* PC = Cast<APlayerController>(Who->GetController());
	const FVector View = PC && PC->PlayerCameraManager ? PC->PlayerCameraManager->GetCameraRotation().Vector() : Who->GetActorForwardVector();
	for (TActorIterator<AWorkshopToy> It(GetWorld()); It; ++It)
	{
		const FVector To = It->GetActorLocation() - Who->GetActorLocation();
		if (To.Size2D() < 170.f && FVector::DotProduct(View.GetSafeNormal2D(), To.GetSafeNormal2D()) > 0.35f)
		{
			return *It;
		}
	}
	return nullptr;
}

bool AStormworksGameMode::TryInteract(ACharacter* Who)
{
	if (OpenNote)
	{
		CloseNote();
		return true;
	}
	if (ContinueIn > 0.f)
	{
		Continue();
		return true;
	}
	if (AStoryNote* Note = NoteInReach(Who))
	{
		OpenNote = Note;
		Note->bRead = true;
		Stormworks::Sound2D(this, TEXT("S_TOS_Paper"), 0.8f);
		UE_LOG(LogStormworks, Log, TEXT("Reading: %s"), *Note->Title);
		if (Note->bFinal)
		{
			Complete();
		}
		return true;
	}
	if (AWorkshopToy* Toy = ToyInReach(Who))
	{
		// Pressing it again while it runs does nothing (and does not fire the tether either).
		Toy->Play();
		return true;
	}
	return false;
}

void AStormworksGameMode::CloseNote()
{
	OpenNote = nullptr;
	// Ivo's last note read: the end card, then on to the house (not during the self-test, which
	// ends here).
	if (bComplete && ContinueIn < 0.f && !FParse::Param(FCommandLine::Get(), TEXT("StormSelfTest"))
		&& FPackageName::DoesPackageExist(HouseMap))
	{
		ContinueIn = 8.f;
	}
}

void AStormworksGameMode::Continue()
{
	ContinueIn = -1.f;
	LeaveIn = 0.7f;
	UE_LOG(LogStormworks, Log, TEXT("On to the house under Knoll Rock"));
}

void AStormworksGameMode::Complete()
{
	if (bComplete)
	{
		return;
	}
	bComplete = true;
	CompleteTime = GetWorld()->GetTimeSeconds() - StartTime;
	SetObjective(TEXT("The Stormworks: escaped. The lighthouse is next."));
	Stormworks::Sound2D(this, TEXT("S_TOS_Complete"), 0.8f);
	UE_LOG(LogStormworks, Log, TEXT("Sequence complete in %.1f s, %d falls"), CompleteTime, Falls);
}

void AStormworksGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	MessageLeft = FMath::Max(0.f, MessageLeft - DeltaSeconds);
	Fade = FMath::Max(0.f, Fade - DeltaSeconds * 1.6f);
	if (ContinueIn > 0.f)
	{
		ContinueIn -= DeltaSeconds;
		if (ContinueIn <= 0.f)
		{
			Continue();
		}
	}
	if (LeaveIn > 0.f)
	{
		// Down to black, then the house loads behind its own title card.
		LeaveIn -= DeltaSeconds;
		Fade = 1.f - FMath::Clamp(LeaveIn / 0.7f, 0.f, 1.f);
		if (LeaveIn <= 0.f)
		{
			UGameplayStatics::OpenLevel(this, FName(HouseMap));
		}
		return;
	}

	ACharacter* C = GetPlayerCharacter();
	if (!C)
	{
		return;
	}
	if (bOpeningPending)
	{
		bOpeningPending = false;
		Cinema->Play(EStormShot::Opening);
	}
	if (C->GetActorLocation().Z < FallZ)
	{
		Respawn(true);
	}
	// Walking away closes the note.
	if (OpenNote && FVector::Dist(OpenNote->GetActorLocation(), C->GetActorLocation()) > 420.f)
	{
		CloseNote();
	}
}
