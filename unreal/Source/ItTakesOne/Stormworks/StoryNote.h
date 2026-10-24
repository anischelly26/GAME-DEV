#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StoryNote.generated.h"

class UPointLightComponent;
class UStaticMeshComponent;
class UTextRenderComponent;

/**
 * Something left behind to read: a note pinned up, with a chalk mark beside it. E in front of it
 * opens it (the HUD shows the text); E again, or walking away, closes it. The final note ends the
 * sequence.
 */
UCLASS()
class ITTAKESONE_API AStoryNote : public AActor
{
	GENERATED_BODY()

public:
	AStoryNote();

	UPROPERTY(VisibleAnywhere, Category = "Note")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "Note")
	TObjectPtr<UStaticMeshComponent> Paper;

	UPROPERTY(VisibleAnywhere, Category = "Note")
	TObjectPtr<UTextRenderComponent> Chalk;

	UPROPERTY(VisibleAnywhere, Category = "Note")
	TObjectPtr<UPointLightComponent> Lamp;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Note")
	FString Title;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Note", meta = (MultiLine = true))
	FString Body;

	/** Chalked on the wall beside the note ("IV"). Empty: none. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Note")
	FString ChalkText = TEXT("IV");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Note")
	bool bFinal = false;

	bool bRead = false;

	virtual void OnConstruction(const FTransform& Transform) override;
};
