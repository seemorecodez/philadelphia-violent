#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PhillyDistrict.generated.h"
class UProceduralMeshComponent;
class UMaterialInterface;
class UHierarchicalInstancedStaticMeshComponent;
class UStaticMesh;
class FJsonObject;

UCLASS()
class APhillyDistrict : public AActor
{
    GENERATED_BODY()
public:
    APhillyDistrict();
    virtual void BeginPlay() override;
    virtual void Tick(float Dt) override;
    UPROPERTY(EditAnywhere) TObjectPtr<UMaterialInterface> SurfaceMaterial;
    UPROPERTY(VisibleAnywhere) int32 ReadyCells=0;
    UPROPERTY(VisibleAnywhere) int32 FailedCells=0;
    UPROPERTY(VisibleAnywhere) int32 StreetInstances=0;
private:
    struct FCell { FString Id; FVector Center; FString File; };
    TArray<FCell> Cells;
    UPROPERTY() TMap<FString,TObjectPtr<UProceduralMeshComponent>> Resident;
    UPROPERTY() TMap<FString,TObjectPtr<UProceduralMeshComponent>> ResidentHouses;
    UPROPERTY() TObjectPtr<UProceduralMeshComponent> Backdrop;
    UPROPERTY() TObjectPtr<UMaterialInterface> BackdropMaterial;
    UPROPERTY() TObjectPtr<UMaterialInterface> HouseMaterial;
    UPROPERTY() TMap<FString,TObjectPtr<UProceduralMeshComponent>> ResidentDetails;
    // One component per mesh type per resident cell, never one actor per prop.
    UPROPERTY() TMap<FString,TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> ResidentProps;
    UPROPERTY() TMap<FString,TObjectPtr<UStaticMesh>> StreetMeshes;
    TMap<FString,float> StreetCullDistances;
    TMap<FString,bool> StreetCollision;
    TMap<FString,float> StreetGroundOffsets;
    void LoadStreetKit();
    void CreateStreetProps(const FCell& Cell,const TSharedPtr<FJsonObject>& Data);
    void ReleaseStreetProps(const FString& CellId);
    TMap<FString,FString> DetailFiles;
    TSet<FString> PendingDetails;
    TSet<FString> FailedDetails;
    void RequestHouseDetail(const FCell& Cell);
    TSet<FString> Pending;
    TSet<FString> Failed;
    float Timer=0;
    float HouseDetailRadius=6500;
    bool bPlayerReleased=false;
    void RequestCell(const FCell& Cell);
    void RequestBackdrop();
};
