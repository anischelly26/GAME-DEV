#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HouseDirector.generated.h"

class ADescentRide;
class AHouseReflection;
class ADirectionalLight;
class AExponentialHeightFog;
class AHouseDetail;
class AMaraCharacter;
class ANacreTentacle;
class APointLight;
class APostProcessVolume;
class ASpotLight;
class AStormRain;
class UAudioComponent;
enum class EStormShot : uint8;

UENUM(BlueprintType)
enum class EHouseBeat : uint8
{
	Outside,
	Inside,
	Inspected,
	Stolen,
	Teacup,
	Retreat,
	Lamp,
	Searchlight,
	Grab,
	Descent,
	Reveal,
	Returned,
};

/**
 * The house under Knoll Rock, beat by beat (docs/STORY_HOUSE_AND_NACRE.md, steps 1 to 12): the storm
 * muffled at the door; Ivo's gauge on the bench; three small details (funny, comforting, wrong) and
 * something under the floor copying her steps; a tentacle that steals the gauge, freezes when she
 * looks at it and hides behind things far too small; a Watch searchlight, the house shaking, the
 * grab (a short cinematic); the tow down through the folding house; the underwater reveal, where
 * Nacre holds the gauge out to her. Placed in the level by tools/unreal/build_house.py, which fills
 * in the references below.
 */
UCLASS()
class ITTAKESONE_API AHouseDirector : public AActor
{
	GENERATED_BODY()

public:
	AHouseDirector();

	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AHouseDetail> Gauge;
	UPROPERTY(EditAnywhere, Category = "House") TArray<TObjectPtr<AHouseDetail>> Details;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<ANacreTentacle> Tentacle;
	UPROPERTY(EditAnywhere, Category = "House") TArray<TObjectPtr<ANacreTentacle>> Burst;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<ANacreTentacle> Offer;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AActor> NacreBody;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<ADescentRide> Ride;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<ASpotLight> Searchlight;
	UPROPERTY(EditAnywhere, Category = "House") TArray<TObjectPtr<APointLight>> HouseLamps;
	UPROPERTY(EditAnywhere, Category = "House") TArray<TObjectPtr<AActor>> Rattles;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<ADirectionalLight> StormKey;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AExponentialHeightFog> Fog;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<APostProcessVolume> Underwater;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AStormRain> Rain;
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AStormRain> Seeds;
	/** The hall door, shut until Nacre bursts it open in the grab; it swings about HallDoorHinge. */
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AActor> HallDoor;
	UPROPERTY(EditAnywhere, Category = "House") FVector HallDoorHinge = FVector::ZeroVector;
	/** Her reflection in the west windows (the water glass makes it fall behind). */
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AHouseReflection> Reflection;
	/**
	 * The reveal: the largest lantern (a second's gentle pull of the camera), Nacre's resting arms,
	 * and its body's path: once across the dawn window in silhouette, then down into the dark below
	 * her, where only its eyes and the arm with the gauge show.
	 */
	UPROPERTY(EditAnywhere, Category = "House") TObjectPtr<AActor> RevealLookAt;
	UPROPERTY(EditAnywhere, Category = "House") TArray<TObjectPtr<ANacreTentacle>> Arms;
	UPROPERTY(EditAnywhere, Category = "House") FVector NacreFrom = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FVector NacreTo = FVector::ZeroVector;

	/** Inside the cottage (world, cm): the storm is muffled here. */
	UPROPERTY(EditAnywhere, Category = "House") FBox Interior = FBox(ForceInit);
	UPROPERTY(EditAnywhere, Category = "House") FVector SinkDrain = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FVector FloorDrain = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FVector TeacupSpot = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FVector LampSpot = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FVector GrabSpot = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FRotator GrabFacing = FRotator::ZeroRotator;
	UPROPERTY(EditAnywhere, Category = "House") FVector HallStart = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FVector RevealEntry = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, Category = "House") FVector OfferSpot = FVector::ZeroVector;

	EHouseBeat GetBeat() const { return Beat; }
	float GetBeatTime() const { return BeatTime; }
	/** E: look at the gauge, take it back. */
	void Interact();
	/** The grab's cinematic has ended (watched or skipped): the tow begins. */
	void OnShotDone(EStormShot Shot);
	bool IsGaugeInReach() const;
	bool IsOfferInReach() const;
	bool IsTentacleLookedAt() const;

	// Read by the self-test.
	int32 DetailsPlayed = 0;
	int32 Echoes = 0;
	int32 Taps = 0;
	float Inside = 0.f;
	float Under = 0.f;
	float StormCutoff = 20000.f;
	bool bSawTentacle = false;
	bool bFrozeWhenSeen = false;
	int32 Shies = 0;

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void SetBeat(EHouseBeat NewBeat);
	void TickSoundscape(float Dt);
	void TickDetails(float Dt);
	void TickTentacle(float Dt);
	void TickShake(bool bOn);
	void StartDescent();
	void StartReveal();
	void OnFootDown(bool bLeft, float Speed);
	/** One step from under the floor, After seconds from now. */
	void EchoStep(float After);
	AMaraCharacter* Mara() const;
	class AHouseGameMode* Mode() const;

	UPROPERTY(Transient) TObjectPtr<UAudioComponent> Storm;
	UPROPERTY(Transient) TObjectPtr<UAudioComponent> Room;
	UPROPERTY(Transient) TObjectPtr<UAudioComponent> Hum;
	UPROPERTY(Transient) TObjectPtr<UAudioComponent> Deep;
	UPROPERTY(Transient) TObjectPtr<UAudioComponent> Heart;
	UPROPERTY(Transient) TObjectPtr<UAudioComponent> Beam;

	EHouseBeat Beat = EHouseBeat::Outside;
	float BeatTime = 0.f;
	float Time = 0.f;
	float NextFlash = 5.f;
	float FlashT = -1.f;
	float ThunderIn = -1.f;
	float HushT = 0.f;
	float KeyBase = 0.9f;
	float FogDensity = 0.035f;
	FLinearColor FogColour = FLinearColor(0.03f, 0.045f, 0.06f);
	bool bFootBound = false;
	TMap<const AHouseDetail*, float> LookTime;
	TArray<FTransform> RattleBase;
	TArray<float> LampBase;
	FTransform HallDoorBase;
	/** How long it has been stared at while frozen, and how long it stays shy afterwards (s). */
	float StaredFor = 0.f;
	float ShyLeft = 0.f;
	TArray<FVector> ArmOffsets;
	bool bOffered = false;
	bool bWalking = false;
};
