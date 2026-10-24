#include "Stormworks/MaraFootsteps.h"

#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Materials/MaterialInterface.h"
#include "Stormworks/MaraAnimInstance.h"
#include "Stormworks/StormworksAssets.h"

UMaraFootsteps::UMaraFootsteps()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.25f;
}

void UMaraFootsteps::BeginPlay()
{
	Super::BeginPlay();
	Bind();
}

void UMaraFootsteps::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	// The anim instance is replaced if the mesh is re-initialised: bind to the current one.
	Bind();
}

void UMaraFootsteps::Bind()
{
	const ACharacter* C = Cast<ACharacter>(GetOwner());
	UMaraAnimInstance* A = C && C->GetMesh() ? Cast<UMaraAnimInstance>(C->GetMesh()->GetAnimInstance()) : nullptr;
	if (!A || A == Anim.Get())
	{
		return;
	}
	Anim = A;
	A->OnFootDown.AddUObject(this, &UMaraFootsteps::OnFootDown);
	A->OnLanded.AddUObject(this, &UMaraFootsteps::OnLanded);
}

FName UMaraFootsteps::SurfaceUnder() const
{
	const ACharacter* C = Cast<ACharacter>(GetOwner());
	if (!C)
	{
		return TEXT("stone");
	}
	const FVector From = C->GetActorLocation();
	const FVector To = From - FVector(0.f, 0.f, C->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 40.f);
	FHitResult Hit;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(MaraFootstep), false, C);
	if (!GetWorld()->LineTraceSingleByChannel(Hit, From, To, ECC_Visibility, Q) || !Hit.GetComponent())
	{
		return TEXT("stone");
	}
	const UMaterialInterface* M = Hit.GetComponent()->GetMaterial(0);
	const FString Name = M ? M->GetName() : FString();
	if (Name.Contains(TEXT("Wood")) || Name.Contains(TEXT("Crate")))
	{
		return TEXT("wood");
	}
	if (Name.Contains(TEXT("Iron")) || Name.Contains(TEXT("Grate")) || Name.Contains(TEXT("Brass")) || Name.Contains(TEXT("Hazard")))
	{
		return TEXT("metal");
	}
	return TEXT("stone");
}

void UMaraFootsteps::OnFootDown(bool bLeft, float Speed)
{
	const ACharacter* C = Cast<ACharacter>(GetOwner());
	if (!C || C->GetCharacterMovement()->IsFalling())
	{
		return;
	}
	const FName Surface = SurfaceUnder();
	const FString Base = Surface == TEXT("wood") ? TEXT("SFX_Step_Wood") : Surface == TEXT("metal") ? TEXT("SFX_Step_Metal") : TEXT("SFX_Step_Stone");
	int32& Last = LastVariant.FindOrAdd(Surface, -1);
	const int32 Pick = Stormworks::Variant(5, Last);
	Last = Pick;
	const FName Bone = bLeft ? TEXT("foot_l") : TEXT("foot_r");
	const FVector At = C->GetMesh()->DoesSocketExist(Bone) ? C->GetMesh()->GetSocketLocation(Bone) : C->GetActorLocation();
	const float Volume = 0.3f + 0.35f * FMath::Clamp(Speed / 600.f, 0.f, 1.f);
	Stormworks::Sound(this, *FString::Printf(TEXT("%s_%d"), *Base, Pick), At, Volume, FMath::FRandRange(0.94f, 1.06f));
	++Steps;
	StepsBySurface.FindOrAdd(Surface)++;
}

void UMaraFootsteps::OnLanded(float FallSpeed)
{
	const ACharacter* C = Cast<ACharacter>(GetOwner());
	if (!C || FallSpeed < 200.f)
	{
		return;
	}
	const bool bHeavy = FallSpeed > 900.f;
	int32& Last = LastVariant.FindOrAdd(bHeavy ? TEXT("landHeavy") : TEXT("land"), -1);
	const int32 Pick = Stormworks::Variant(5, Last);
	Last = Pick;
	const FVector Feet = C->GetActorLocation() - FVector(0.f, 0.f, C->GetCapsuleComponent()->GetScaledCapsuleHalfHeight());
	Stormworks::Sound(this, *FString::Printf(TEXT("%s_%d"), bHeavy ? TEXT("SFX_LandHeavy") : TEXT("SFX_Land"), Pick), Feet, FMath::Clamp(FallSpeed / 1100.f, 0.35f, 1.f));
	// And the surface, as both feet come down.
	OnFootDown(true, FMath::Min(FallSpeed, 600.f));
	++Landings;
}
