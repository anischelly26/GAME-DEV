#include "Stormworks/CollapsingWalkway.h"

#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/Pawn.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/TetherComponent.h"

// ------------------------------------------------------------------------------------------------
// ACollapsingSegment

ACollapsingSegment::ACollapsingSegment()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Hinge = CreateDefaultSubobject<USceneComponent>(TEXT("Hinge"));
	Hinge->SetupAttachment(Root);
	Hinge->SetMobility(EComponentMobility::Movable);

	Deck = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Deck"));
	Deck->SetupAttachment(Hinge);
	Deck->SetMobility(EComponentMobility::Movable);

	RailLeft = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("RailLeft"));
	RailLeft->SetupAttachment(Hinge);
	RailLeft->SetMobility(EComponentMobility::Movable);

	RailRight = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("RailRight"));
	RailRight->SetupAttachment(Hinge);
	RailRight->SetMobility(EComponentMobility::Movable);

	Warning = CreateDefaultSubobject<UPointLightComponent>(TEXT("Warning"));
	Warning->SetupAttachment(Hinge);
	Warning->SetMobility(EComponentMobility::Movable);
	Warning->SetLightColor(FLinearColor(1.f, 0.12f, 0.05f));
	Warning->SetIntensity(0.f);
	Warning->SetAttenuationRadius(500.f);
	Warning->SetCastShadows(false);
}

void ACollapsingSegment::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	UStaticMesh* Cube = Stormworks::Mesh(TEXT("Cube"));
	Deck->SetStaticMesh(Cube);
	Deck->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Grate")));
	Deck->SetRelativeLocation(FVector(Size.X * 0.5f, 0.f, -Size.Z * 0.5f));
	Deck->SetRelativeScale3D(Size / 100.f);

	for (int32 Side = 0; Side < 2; ++Side)
	{
		UStaticMeshComponent* R = Side == 0 ? RailLeft : RailRight;
		R->SetStaticMesh(Cube);
		R->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Iron")));
		const float Y = (Side == 0 ? -1.f : 1.f) * (Size.Y * 0.5f - 4.f);
		R->SetRelativeLocation(FVector(Size.X * 0.5f, Y, 50.f));
		R->SetRelativeScale3D(FVector(Size.X / 100.f, 0.06f, 1.0f));
	}
	Warning->SetRelativeLocation(FVector(Size.X * 0.5f, 0.f, 60.f));
	Restore();
}

void ACollapsingSegment::SetSolid(bool bSolid)
{
	const ECollisionEnabled::Type C = bSolid ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision;
	Deck->SetCollisionEnabled(C);
	RailLeft->SetCollisionEnabled(C);
	RailRight->SetCollisionEnabled(C);
}

void ACollapsingSegment::Telegraph()
{
	if (Phase != 0)
	{
		return;
	}
	Phase = 1;
	T = 0.f;
	Stormworks::Sound(this, TEXT("S_TOS_Creak"), Hinge->GetComponentLocation() + FVector(Size.X * 0.5f, 0.f, 0.f), 1.f, FMath::FRandRange(0.85f, 1.1f));
}

void ACollapsingSegment::Fall()
{
	if (Phase >= 2)
	{
		return;
	}
	Phase = 2;
	T = 0.f;
	Spin = FMath::FRandRange(0.7f, 1.2f) * (FMath::RandBool() ? 1.f : -1.f);
	Warning->SetIntensity(0.f);
	Stormworks::Sound(this, TEXT("S_TOS_Crash"), Hinge->GetComponentLocation() + FVector(Size.X * 0.5f, 0.f, 0.f), 1.f, FMath::FRandRange(0.9f, 1.05f));
	// Felt as well as heard, if she is close.
	if (APawn* P = UGameplayStatics::GetPlayerPawn(this, 0))
	{
		const float D = FVector::Dist(P->GetActorLocation(), Hinge->GetComponentLocation());
		if (UTetherComponent* Tc = P->FindComponentByClass<UTetherComponent>())
		{
			Tc->AddShake(FMath::Clamp(1.f - D / 1800.f, 0.f, 1.f) * 0.55f);
		}
	}
}

void ACollapsingSegment::Restore()
{
	Phase = 0;
	T = 0.f;
	Hinge->SetRelativeLocationAndRotation(FVector::ZeroVector, FRotator::ZeroRotator);
	Hinge->SetVisibility(true, true);
	Warning->SetIntensity(0.f);
	SetSolid(true);
}

void ACollapsingSegment::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (Phase == 0 || Phase == 3)
	{
		return;
	}
	T += DeltaSeconds;
	if (Phase == 1)
	{
		// Shudder, harder as it goes, and the red lamp stutters.
		const float K = FMath::Min(1.f, T / 0.8f);
		const float A = 1.5f + 4.f * K;
		Hinge->SetRelativeLocation(FVector(0.f, A * FMath::Sin(T * 61.f), A * 0.6f * FMath::Sin(T * 47.f) - 6.f * K));
		Hinge->SetRelativeRotation(FRotator(-2.f * K, 0.f, 1.2f * K * FMath::Sin(T * 13.f)));
		Warning->SetIntensity(FMath::Sin(T * 40.f) > 0.f ? 9000.f : 600.f);
		return;
	}
	// Falling: tips down about the hinge, slides off and drops.
	const float G = 1400.f;
	Hinge->SetRelativeLocation(FVector(0.f, 0.f, -0.5f * G * T * T));
	Hinge->SetRelativeRotation(FRotator(-FMath::Min(70.f, 55.f * T * T + 8.f * T), 0.f, Spin * 25.f * T));
	if (T > 0.22f)
	{
		SetSolid(false);
	}
	if (T > 2.6f)
	{
		Phase = 3;
		Hinge->SetVisibility(false, true);
	}
}

// ------------------------------------------------------------------------------------------------
// ACollapsingWalkway

ACollapsingWalkway::ACollapsingWalkway()
{
	PrimaryActorTick.bCanEverTick = true;
	StartTrigger = CreateDefaultSubobject<UBoxComponent>(TEXT("StartTrigger"));
	SetRootComponent(StartTrigger);
	StartTrigger->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	StartTrigger->SetCollisionResponseToAllChannels(ECR_Ignore);
	StartTrigger->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	StartTrigger->SetGenerateOverlapEvents(true);
}

void ACollapsingWalkway::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	StartTrigger->SetBoxExtent(TriggerExtent);
}

void ACollapsingWalkway::BeginPlay()
{
	Super::BeginPlay();
	StartTrigger->OnComponentBeginOverlap.AddDynamic(this, &ACollapsingWalkway::OnEnter);
}

void ACollapsingWalkway::OnEnter(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep)
{
	const APawn* P = Cast<APawn>(Other);
	if (P && P->IsPlayerControlled() && bArmed && !bRunning)
	{
		StartCollapse();
	}
}

void ACollapsingWalkway::StartCollapse()
{
	bRunning = true;
	T = 0.f;
	Fallen = 0;
	++Runs;
	Stage.Init(0, Segments.Num());
	Stormworks::Sound2D(this, TEXT("S_TOS_Rumble"), 0.9f);
	if (AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>())
	{
		GM->ShowMessage(TEXT("It's going! Keep moving!"), 2.2f);
	}
	UE_LOG(LogStormworks, Log, TEXT("Walkway: collapse %d starts (%d segments)"), Runs, Segments.Num());
}

void ACollapsingWalkway::ResetWalkway()
{
	bRunning = false;
	T = 0.f;
	Fallen = 0;
	for (ACollapsingSegment* S : Segments)
	{
		if (S)
		{
			S->Restore();
		}
	}
	UE_LOG(LogStormworks, Log, TEXT("Walkway: reset"));
}

void ACollapsingWalkway::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bRunning)
	{
		return;
	}
	T += DeltaSeconds;
	for (int32 i = 0; i < Segments.Num(); ++i)
	{
		ACollapsingSegment* S = Segments[i];
		if (!S || !Stage.IsValidIndex(i))
		{
			continue;
		}
		const float FallAt = StartDelay + i * Interval;
		if (Stage[i] == 0 && T >= FallAt - TelegraphTime)
		{
			S->Telegraph();
			Stage[i] = 1;
		}
		if (Stage[i] == 1 && T >= FallAt)
		{
			S->Fall();
			Stage[i] = 2;
			++Fallen;
		}
	}
}
