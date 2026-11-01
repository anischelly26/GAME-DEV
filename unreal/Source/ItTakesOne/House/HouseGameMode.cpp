#include "House/HouseGameMode.h"

#include "Engine/LocalPlayer.h"
#include "EngineUtils.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/PlayerController.h"
#include "House/HouseDirector.h"
#include "House/HouseHUD.h"
#include "House/HouseSelfTest.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "ItTakesOne.h"
#include "Misc/CommandLine.h"
#include "Stormworks/MaraCharacter.h"
#include "Stormworks/ReadyGate.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormworksAssets.h"

AHouseGameMode::AHouseGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = AMaraCharacter::StaticClass();
	PlayerControllerClass = APlayerController::StaticClass();
	HUDClass = AHouseHUD::StaticClass();
	Cinema = CreateDefaultSubobject<UStormCinema>(TEXT("Cinema"));
}

void AHouseGameMode::StartPlay()
{
	Super::StartPlay();
	Gate = AReadyGate::Hold(GetWorld(), TEXT("The house under Knoll Rock"));
	Cinema->OnProgress.AddUObject(this, &AHouseGameMode::OnShotProgress);
	SetObjective(TEXT("Find Ivo's house under the light"));
	if (FParse::Param(FCommandLine::Get(), TEXT("HouseSelfTest")))
	{
		GetWorld()->SpawnActor<AHouseSelfTest>();
	}
}

void AHouseGameMode::RestartPlayer(AController* NewPlayer)
{
	Super::RestartPlayer(NewPlayer);
	if (APlayerController* PC = Cast<APlayerController>(NewPlayer))
	{
		BindInput(PC);
	}
}

void AHouseGameMode::BindInput(APlayerController* PC)
{
	if (Mapping || !PC->InputComponent)
	{
		return;
	}
	InteractAction = NewObject<UInputAction>(this, TEXT("IA_HouseInteract"));
	SkipAction = NewObject<UInputAction>(this, TEXT("IA_HouseSkip"));
	// Space also jumps (Mara's own mapping): skipping must not swallow the key.
	SkipAction->bConsumeInput = false;
	Mapping = NewObject<UInputMappingContext>(this, TEXT("IMC_House"));
	Mapping->MapKey(InteractAction, EKeys::E);
	Mapping->MapKey(InteractAction, EKeys::LeftMouseButton);
	Mapping->MapKey(InteractAction, EKeys::Gamepad_RightTrigger);
	Mapping->MapKey(SkipAction, EKeys::SpaceBar);
	Mapping->MapKey(SkipAction, EKeys::Enter);
	Mapping->MapKey(SkipAction, EKeys::Gamepad_FaceButton_Bottom);
	Mapping->MapKey(SkipAction, EKeys::Gamepad_FaceButton_Right);
	if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
	{
		Sub->AddMappingContext(Mapping, 2);
	}
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PC->InputComponent))
	{
		EIC->BindAction(InteractAction, ETriggerEvent::Started, this, &AHouseGameMode::OnInteract);
		EIC->BindAction(SkipAction, ETriggerEvent::Started, this, &AHouseGameMode::OnSkip);
	}
}

void AHouseGameMode::OnInteract()
{
	if (Cinema->IsPlaying())
	{
		Cinema->Skip();
		return;
	}
	if (AHouseDirector* D = GetDirector())
	{
		D->Interact();
	}
}

void AHouseGameMode::OnSkip()
{
	Cinema->Skip();
}

void AHouseGameMode::OnShotProgress(EStormShot Shot)
{
	if (AHouseDirector* D = GetDirector())
	{
		D->OnShotDone(Shot);
	}
}

AHouseDirector* AHouseGameMode::GetDirector() const
{
	if (!Director.IsValid())
	{
		for (TActorIterator<AHouseDirector> It(GetWorld()); It; ++It)
		{
			Director = *It;
			break;
		}
	}
	return Director.Get();
}

void AHouseGameMode::SetObjective(const FString& Text)
{
	if (Objective != Text)
	{
		Objective = Text;
		UE_LOG(LogStormworks, Log, TEXT("House objective: %s"), *Text);
	}
}

void AHouseGameMode::ShowMessage(const FString& Text, float Seconds)
{
	Message = Text;
	MessageLeft = Seconds;
	UE_LOG(LogStormworks, Log, TEXT("House message: %s"), *Text);
}

void AHouseGameMode::Complete()
{
	if (!bComplete)
	{
		bComplete = true;
		SetObjective(TEXT("Next: the Sunken Conservatory"));
		Stormworks::Sound2D(this, TEXT("S_TOS_Complete"), 0.6f);
		UE_LOG(LogStormworks, Log, TEXT("House: slice complete"));
	}
}

void AHouseGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	MessageLeft = FMath::Max(0.f, MessageLeft - DeltaSeconds);
}
