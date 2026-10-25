#include "Stormworks/MaraCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Engine/LocalPlayer.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Stormworks/MaraAnimInstance.h"
#include "Stormworks/MaraFootsteps.h"

AMaraCharacter::AMaraCharacter()
{
	// Her size (UMaraAnimInstance::Dress sets the same).
	GetCapsuleComponent()->InitCapsuleSize(30.f, 66.f);

	// The Third Person template's character, value for value.
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;
	UCharacterMovementComponent* MC = GetCharacterMovement();
	MC->bOrientRotationToMovement = true;
	MC->RotationRate = FRotator(0.f, 500.f, 0.f);
	MC->MaxWalkSpeed = 600.f;
	MC->MinAnalogWalkSpeed = 20.f;
	MC->MaxAcceleration = 1500.f;
	MC->BrakingDecelerationWalking = 2000.f;
	MC->BrakingDecelerationFalling = 1500.f;
	MC->GroundFriction = 8.f;
	MC->JumpZVelocity = 500.f;
	MC->AirControl = 0.35f;
	MC->GravityScale = 1.f;
	// In water: neutral buoyancy, a calm stroke.
	MC->MaxSwimSpeed = 360.f;
	MC->BrakingDecelerationSwimming = 900.f;
	MC->Buoyancy = 1.f;
	MC->GetNavAgentPropertiesRef().bCanSwim = true;
	PrimaryActorTick.bCanEverTick = true;

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->SetRelativeLocation(FVector(0.f, 0.f, 8.5f));
	CameraBoom->TargetArmLength = 400.f;
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bDoCollisionTest = true;
	CameraBoom->ProbeSize = 12.f;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;
	FollowCamera->SetFieldOfView(90.f);

	Bubble = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Bubble"));
	Bubble->SetupAttachment(GetMesh());
	Bubble->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Bubble->SetCastShadow(false);
	Bubble->SetVisibility(false);
	// Round her big head: its centre in her bind pose (the mesh's own frame).
	Bubble->SetRelativeLocation(FVector(0.f, 3.5f, 102.f));
}

FVector2D AMaraCharacter::GetSteerInput() const
{
	return GetWorld() && GetWorld()->GetTimeSeconds() - LastMoveTime < 0.1 ? LastMove : FVector2D::ZeroVector;
}

void AMaraCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UCharacterMovementComponent* MC = GetCharacterMovement();
	const bool bInWater = MC->IsSwimming() || MC->IsFlying();
	if (MC->IsSwimming())
	{
		// Rise and dive (Space or the right shoulder; C, Ctrl or the left shoulder).
		if (bPressedJump)
		{
			AddMovementInput(FVector::UpVector, 1.f);
		}
		if (bDiving)
		{
			AddMovementInput(FVector::UpVector, -1.f);
		}
	}
	// Lying into the stroke as she swims (about her middle, so her head goes forward, not her feet).
	if (bDressed)
	{
		const float Want = bInWater ? 70.f * FMath::Clamp(GetVelocity().Size() / 250.f, 0.f, 1.f) : 0.f;
		SwimTilt = FMath::FInterpTo(SwimTilt, Want, DeltaSeconds, 4.f);
		const FQuat Tilt(FVector::YAxisVector, FMath::DegreesToRadians(SwimTilt));
		const float Half = GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight();
		GetMesh()->SetRelativeLocationAndRotation(Tilt.RotateVector(FVector(0.f, 0.f, -Half)), Tilt * FRotator(0.f, -90.f, 0.f).Quaternion());
	}
	// The bubble grows over her head, or shrinks away.
	BubbleScale = FMath::FInterpTo(BubbleScale, bBubbleWanted ? 1.f : 0.f, DeltaSeconds, 6.f);
	Bubble->SetVisibility(BubbleScale > 0.02f);
	Bubble->SetRelativeScale3D(FVector(0.74f * BubbleScale));
}

void AMaraCharacter::BeginPlay()
{
	Super::BeginPlay();
	bDressed = UMaraAnimInstance::Dress(this);
	Bubble->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere")));
	if (UMaterialInterface* Glass = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/ItTakesOne/House/Materials/MI_House_Bubble.MI_House_Bubble"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Bubble->SetMaterial(0, Glass);
	}
	if (bDressed && !FindComponentByClass<UMaraFootsteps>())
	{
		UMaraFootsteps* Steps = NewObject<UMaraFootsteps>(this, TEXT("Footsteps"));
		Steps->RegisterComponent();
	}
}

void AMaraCharacter::BuildInput()
{
	if (Mapping)
	{
		return;
	}
	// Built at run time, like the template's IMC_Default and IMC_MouseLook (same keys, same modifiers).
	MoveAction = NewObject<UInputAction>(this, TEXT("IA_Move"));
	MoveAction->ValueType = EInputActionValueType::Axis2D;
	LookAction = NewObject<UInputAction>(this, TEXT("IA_Look"));
	LookAction->ValueType = EInputActionValueType::Axis2D;
	JumpAction = NewObject<UInputAction>(this, TEXT("IA_Jump"));
	JumpAction->ValueType = EInputActionValueType::Boolean;
	DiveAction = NewObject<UInputAction>(this, TEXT("IA_Dive"));
	DiveAction->ValueType = EInputActionValueType::Boolean;
	Mapping = NewObject<UInputMappingContext>(this, TEXT("IMC_Mara"));

	auto Swizzle = [this]()
	{
		UInputModifierSwizzleAxis* M = NewObject<UInputModifierSwizzleAxis>(Mapping);
		M->Order = EInputAxisSwizzle::YXZ;
		return M;
	};
	auto Negate = [this](bool bX, bool bY)
	{
		UInputModifierNegate* M = NewObject<UInputModifierNegate>(Mapping);
		M->bX = bX;
		M->bY = bY;
		M->bZ = bX;
		return M;
	};
	auto DeadZone = [this]()
	{
		UInputModifierDeadZone* M = NewObject<UInputModifierDeadZone>(Mapping);
		M->LowerThreshold = 0.2f;
		return M;
	};
	// Forward and back are the Y axis, left and right the X axis.
	for (const FKey& Key : {EKeys::W, EKeys::Up})
	{
		Mapping->MapKey(MoveAction, Key).Modifiers.Add(Swizzle());
	}
	for (const FKey& Key : {EKeys::S, EKeys::Down})
	{
		FEnhancedActionKeyMapping& M = Mapping->MapKey(MoveAction, Key);
		M.Modifiers.Add(Swizzle());
		M.Modifiers.Add(Negate(true, true));
	}
	for (const FKey& Key : {EKeys::A, EKeys::Left})
	{
		Mapping->MapKey(MoveAction, Key).Modifiers.Add(Negate(true, true));
	}
	Mapping->MapKey(MoveAction, EKeys::D);
	Mapping->MapKey(MoveAction, EKeys::Right);
	Mapping->MapKey(MoveAction, EKeys::Gamepad_Left2D).Modifiers.Add(DeadZone());
	Mapping->MapKey(LookAction, EKeys::Mouse2D).Modifiers.Add(Negate(false, true));
	Mapping->MapKey(LookAction, EKeys::Gamepad_Right2D).Modifiers.Add(DeadZone());
	Mapping->MapKey(JumpAction, EKeys::SpaceBar);
	Mapping->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	// In water: the right shoulder rises like Space; C, Ctrl or the left shoulder dives.
	Mapping->MapKey(JumpAction, EKeys::Gamepad_RightShoulder);
	Mapping->MapKey(DiveAction, EKeys::C);
	Mapping->MapKey(DiveAction, EKeys::LeftControl);
	Mapping->MapKey(DiveAction, EKeys::Gamepad_LeftShoulder);
}

void AMaraCharacter::PawnClientRestart()
{
	Super::PawnClientRestart();
	BuildInput();
	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			Sub->AddMappingContext(Mapping, 0);
		}
	}
}

void AMaraCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	BuildInput();
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		EIC->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
		EIC->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
		EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AMaraCharacter::Move);
		EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AMaraCharacter::Look);
		EIC->BindActionValueLambda(DiveAction, ETriggerEvent::Started, [this](const FInputActionValue&) { bDiving = true; });
		EIC->BindActionValueLambda(DiveAction, ETriggerEvent::Completed, [this](const FInputActionValue&) { bDiving = false; });
	}
}

void AMaraCharacter::Move(const FInputActionValue& Value)
{
	const FVector2D V = Value.Get<FVector2D>();
	LastMove = V;
	LastMoveTime = GetWorld()->GetTimeSeconds();
	if (!Controller)
	{
		return;
	}
	const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
	// Swimming goes where the camera looks, up and down included.
	const FVector Forward = GetCharacterMovement()->IsSwimming() ? Controller->GetControlRotation().Vector() : FRotationMatrix(Yaw).GetUnitAxis(EAxis::X);
	AddMovementInput(Forward, V.Y);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), V.X);
}

void AMaraCharacter::Look(const FInputActionValue& Value)
{
	const FVector2D V = Value.Get<FVector2D>();
	AddControllerYawInput(V.X);
	AddControllerPitchInput(V.Y);
}
