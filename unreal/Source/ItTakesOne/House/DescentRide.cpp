#include "House/DescentRide.h"

#include "Components/SplineComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "House/NacreTentacle.h"
#include "ItTakesOne.h"
#include "Stormworks/MaraCharacter.h"
#include "Stormworks/StormworksAssets.h"

ADescentRide::ADescentRide()
{
	PrimaryActorTick.bCanEverTick = true;
	Path = CreateDefaultSubobject<USplineComponent>(TEXT("Path"));
	SetRootComponent(Path);
}

float ADescentRide::GetProgress() const
{
	return Distance / FMath::Max(1.f, Path->GetSplineLength());
}

void ADescentRide::Begin(AMaraCharacter* Who)
{
	if (bRunning || !Who)
	{
		return;
	}
	Rider = Who;
	bRunning = true;
	bFinished = false;
	Distance = 0.f;
	Offset = FVector2D::ZeroVector;
	Hit.Reset();
	// Carried: no gravity, no walking; the ride places her every frame.
	Who->GetCharacterMovement()->SetMovementMode(MOVE_Flying);
	if (Tow)
	{
		Tow->SetOut(true, 0.3f);
	}
	UE_LOG(LogStormworks, Log, TEXT("Descent: begins, %.0f m"), Path->GetSplineLength() / 100.f);
}

void ADescentRide::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	AMaraCharacter* M = Rider.Get();
	if (!bRunning || !M)
	{
		return;
	}
	const float Dt = FMath::Min(DeltaSeconds, 0.05f);
	const float Length = Path->GetSplineLength();
	const float U = Distance / FMath::Max(1.f, Length);
	// Gentle at the start, quick through the middle, easing into the reveal.
	const float Speed = FMath::Lerp(300.f, 650.f, FMath::Sin(FMath::Clamp(U, 0.f, 1.f) * PI));
	Distance = FMath::Min(Length, Distance + Speed * Dt);

	// Steering: the stick moves her about the path; let go and the tow draws her back to the middle.
	const FVector2D In = M->GetSteerInput();
	const FVector2D Before = Offset;
	Offset += FVector2D(In.X, In.Y) * 260.f * Dt;
	if (In.IsNearlyZero())
	{
		Offset = FMath::Vector2DInterpTo(Offset, FVector2D::ZeroVector, Dt, 0.6f);
	}
	if (Offset.Size() > Radius)
	{
		Offset = Offset.GetSafeNormal() * Radius;
	}
	SteerTravel += (Offset - Before).Size();

	const FVector Centre = Path->GetLocationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::World);
	const FVector Ahead = Path->GetDirectionAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::World);
	const FVector Right = FVector::CrossProduct(FVector::UpVector, Ahead).GetSafeNormal();
	const FVector Up = FVector::CrossProduct(Ahead, Right).GetSafeNormal();
	FVector At = Centre + Right * Offset.X + Up * Offset.Y;

	// Floating things nudge her aside (a knock, never a failure).
	for (AActor* O : Obstacles)
	{
		if (!O)
		{
			continue;
		}
		FVector Origin, Extent;
		O->GetActorBounds(true, Origin, Extent);
		const float R = FMath::Min(Extent.GetMax(), 130.f) + 30.f;
		const FVector Away = At - Origin;
		const float D = Away.Size();
		if (D < R)
		{
			const FVector Push = Away.GetSafeNormal() * (R - D);
			Offset += FVector2D(FVector::DotProduct(Push, Right), FVector::DotProduct(Push, Up));
			At = Centre + Right * Offset.X + Up * Offset.Y;
			if (!Hit.Contains(O))
			{
				Hit.Add(O);
				++Bumps;
				Stormworks::Sound(this, *FString::Printf(TEXT("SFX_Land_%d"), FMath::RandRange(0, 4)), At, 0.6f, 0.8f);
			}
		}
	}

	M->SetActorLocation(At, false, nullptr, ETeleportType::TeleportPhysics);
	M->GetCharacterMovement()->Velocity = Ahead * Speed;
	M->SetActorRotation(FRotator(0.f, Ahead.Rotation().Yaw, 0.f));
	// The camera looks down the passage, a little from above.
	if (APlayerController* PC = Cast<APlayerController>(M->GetController()))
	{
		const FRotator Want = (Ahead + FVector(0.f, 0.f, -0.15f)).Rotation();
		PC->SetControlRotation(FMath::RInterpTo(PC->GetControlRotation(), Want, Dt, 3.f));
	}
	// Nacre's tentacle pulls from up ahead.
	if (Tow)
	{
		const float Lead = FMath::Min(Length, Distance + 380.f);
		// Its base up ahead, reaching back toward her.
		const FVector Back = -Path->GetDirectionAtDistanceAlongSpline(Lead, ESplineCoordinateSpace::World);
		Tow->MoveBase(Path->GetLocationAtDistanceAlongSpline(Lead, ESplineCoordinateSpace::World), FQuat::FindBetweenNormals(FVector::UpVector, Back).Rotator());
		Tow->SnapTip(At + FVector(0.f, 0.f, 10.f));
	}

	if (Distance >= Length)
	{
		bRunning = false;
		bFinished = true;
		if (Tow)
		{
			Tow->SetOut(false, 0.6f);
		}
		UE_LOG(LogStormworks, Log, TEXT("Descent: ends, %d knocks"), Bumps);
		OnFinished.Broadcast();
	}
}
