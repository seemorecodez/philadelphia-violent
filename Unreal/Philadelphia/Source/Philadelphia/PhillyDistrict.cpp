#include "PhillyDistrict.h"
#include "PhillyGameplay.h"
#include "Async/Async.h"
#include "Dom/JsonObject.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/DirectionalLight.h"
#include "Components/DirectionalLightComponent.h"
#include "EngineUtils.h"

namespace {
TSharedPtr<FJsonObject> ReadSource(const FString& Name)
{
    FString Text;
    TSharedPtr<FJsonObject> Data;
    if(!FFileHelper::LoadFileToString(Text,*(FPaths::ProjectContentDir()/TEXT("SourceData")/Name))) return nullptr;
    const auto Reader=TJsonReaderFactory<>::Create(Text);
    return FJsonSerializer::Deserialize(Reader,Data)?Data:nullptr;
}
// Horizontal distance to a 100m cell footprint; centers have no terrain Z.
float DetailDistanceSquared(const FVector& Center,const FVector& Focus)
{
    const float X=FMath::Max(0.0,FMath::Abs(Focus.X-Center.X)-5000.0);
    const float Y=FMath::Max(0.0,FMath::Abs(Focus.Y-Center.Y)-5000.0);
    return X*X+Y*Y;
}
FLinearColor SurfaceColor(const FString& Kind)
{
    if(Kind=="road") return FLinearColor(.07f,.078f,.085f);
    if(Kind=="paint") return FLinearColor(.82f,.8f,.7f);
    if(Kind=="yellow") return FLinearColor(.9f,.57f,.035f);
    if(Kind=="grass") return FLinearColor(.11f,.19f,.07f);
    if(Kind=="earth" || Kind=="ground") return FLinearColor(.23f,.22f,.19f);
    if(Kind=="parking") return FLinearColor(.11f,.12f,.13f);
    return FLinearColor(.46f,.44f,.40f);
}
}
APhillyDistrict::APhillyDistrict()
{
    PrimaryActorTick.bCanEverTick=true;
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("DistrictOrigin")));
}
void APhillyDistrict::BeginPlay()
{
    Super::BeginPlay();
    // The existing forward-renderer profile targets the integrated GPU. Spend
    // shadow resolution at walking/driving distance instead of rendering four
    // cascades over 400m. The source map and its saved lighting stay unchanged.
    if(FParse::Param(FCommandLine::Get(),TEXT("PhillyForwardSky"))&&!FParse::Param(FCommandLine::Get(),TEXT("PhillyExtendedShadows")))
    {
        for(TActorIterator<ADirectionalLight> It(GetWorld());It;++It)
        {
            auto* Light=It->GetComponent();
            Light->SetDynamicShadowDistanceMovableLight(18000.f);
            Light->SetDynamicShadowCascades(2);
        }
    }
    float RequestedDetailRadius=HouseDetailRadius;
    if(FParse::Value(FCommandLine::Get(),TEXT("PhillyHouseDetailRadius="),RequestedDetailRadius)&&FMath::IsFinite(RequestedDetailRadius))
        HouseDetailRadius=FMath::Clamp(RequestedDetailRadius,6500.f,18000.f);
    if(FParse::Param(FCommandLine::Get(),TEXT("PhillyNormals")))
        SurfaceMaterial=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Philadelphia/Materials/M_SurfaceNormalsDiagnostic.M_SurfaceNormalsDiagnostic"));
    const auto Manifest=ReadSource(TEXT("manifest.json"));
    if(!Manifest) {UE_LOG(LogTemp,Error,TEXT("PHILLY district source manifest missing"));return;}
    for(const auto& Item:Manifest->GetArrayField(TEXT("cells")))
    {
        const auto Obj=Item->AsObject();
        const FString Id=Obj->GetStringField(TEXT("id"));
        Cells.Add({Id,FVector(Obj->GetNumberField(TEXT("x")),Obj->GetNumberField(TEXT("y")),0),Id+TEXT(".json")});
    }
    HouseMaterial=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Philadelphia/Materials/M_SouthHouse.M_SouthHouse"));
    if(const auto Packs=ReadSource(TEXT("city-packs.json")))
    {
        for(const auto& Value:Packs->GetArrayField(TEXT("packs")))
        {
            const FString Pack=Value->AsString();
            if(Pack.IsEmpty() || Pack.Contains(TEXT("..")) || Pack.Contains(TEXT("/")) || Pack.Contains(TEXT("\\")))continue;
            if(const auto Extra=ReadSource(Pack/TEXT("manifest.json")))
            {
                if(!FMath::IsNearlyEqual(Extra->GetNumberField(TEXT("originHeight")),Manifest->GetNumberField(TEXT("originHeight")),.000001))
                {UE_LOG(LogTemp,Error,TEXT("PHILLY pack %s has incompatible height frame"),*Pack);continue;}
                for(const auto& Item:Extra->GetArrayField(TEXT("cells")))
                {
                    const auto Obj=Item->AsObject();const FString Id=Obj->GetStringField(TEXT("id"));
                    if(Cells.ContainsByPredicate([&](const FCell& C){return C.Id==Id;}))continue;
                    Cells.Add({Id,FVector(Obj->GetNumberField(TEXT("x")),Obj->GetNumberField(TEXT("y")),0),Pack/(Id+TEXT(".json"))});
                }
                UE_LOG(LogTemp,Display,TEXT("PHILLY_NATIVE_PACK %s cells=%d"),*Pack,Extra->GetArrayField(TEXT("cells")).Num());
            }
        }
    }
    if(!FParse::Param(FCommandLine::Get(),TEXT("PhillyNoStreetDetails")))LoadStreetKit();
    if(!FParse::Param(FCommandLine::Get(),TEXT("PhillyNoBackdrop")))RequestBackdrop();
}
void APhillyDistrict::LoadStreetKit()
{
    const auto Kit=ReadSource(TEXT("street-kit.json"));
    if(!Kit)return; // Older exports have no prop registry and remain loadable.
    const TArray<TSharedPtr<FJsonValue>>* Assets=nullptr;
    if(!Kit->TryGetArrayField(TEXT("assets"),Assets))return;
    for(const auto& Value:*Assets)
    {
        const auto Item=Value->AsObject();if(!Item)continue;
        FString Kind,Path;double Cull=12000,GroundOffset=0;bool Collision=true;
        if(!Item->TryGetStringField(TEXT("kind"),Kind)||!Item->TryGetStringField(TEXT("mesh"),Path)
            ||!Path.StartsWith(TEXT("/Game/Philadelphia/Assets/")))continue;
        Item->TryGetNumberField(TEXT("cullDistanceCm"),Cull);Item->TryGetBoolField(TEXT("collision"),Collision);
        Item->TryGetNumberField(TEXT("groundOffsetCm"),GroundOffset);
        if(!FMath::IsFinite(Cull)||Cull<1000||Cull>48000)continue;
        if(auto* Mesh=LoadObject<UStaticMesh>(nullptr,*Path))
        {StreetMeshes.Add(Kind,Mesh);StreetCullDistances.Add(Kind,float(Cull));StreetCollision.Add(Kind,Collision);StreetGroundOffsets.Add(Kind,FMath::IsFinite(GroundOffset)?float(GroundOffset):0);}
        else UE_LOG(LogTemp,Error,TEXT("PHILLY_STREET_KIT missing %s %s"),*Kind,*Path);
    }
    UE_LOG(LogTemp,Display,TEXT("PHILLY_STREET_KIT shared_meshes=%d"),StreetMeshes.Num());
}
void APhillyDistrict::CreateStreetProps(const FCell& Cell,const TSharedPtr<FJsonObject>& Data)
{
    const TArray<TSharedPtr<FJsonValue>>* Props=nullptr;
    if(StreetMeshes.IsEmpty()||!Data->TryGetArrayField(TEXT("streetProps"),Props))return;
    TMap<FString,TArray<FTransform>> Groups;
    int32 Rejected=0;
    for(const auto& Value:*Props)
    {
        const auto Obj=Value->AsObject();
        const TArray<TSharedPtr<FJsonValue>> *P=nullptr,*S=nullptr;
        FString Kind;double Yaw=0,Pitch=0;
        if(!Obj||!Obj->TryGetStringField(TEXT("kind"),Kind)||!StreetMeshes.Contains(Kind)
            ||!Obj->TryGetArrayField(TEXT("position"),P)||P->Num()!=3
            ||!Obj->TryGetArrayField(TEXT("scale"),S)||S->Num()!=3
            ||!Obj->TryGetNumberField(TEXT("yaw"),Yaw)){Rejected++;continue;}
        Obj->TryGetNumberField(TEXT("pitch"),Pitch);
        FVector Position((*P)[0]->AsNumber(),(*P)[1]->AsNumber(),(*P)[2]->AsNumber());
        FVector Scale((*S)[0]->AsNumber(),(*S)[1]->AsNumber(),(*S)[2]->AsNumber());
        const FVector Local=Position-Cell.Center+FVector(0,0,StreetGroundOffsets.FindRef(Kind)*Scale.Z);
        if(Position.ContainsNaN()||Scale.ContainsNaN()||!FMath::IsFinite(Yaw)||!FMath::IsFinite(Pitch)
            ||FMath::Abs(Local.X)>5100||FMath::Abs(Local.Y)>5100||FMath::Abs(Local.Z)>100000
            ||Scale.GetMin()<=0||Scale.GetMax()>100){Rejected++;continue;}
        Groups.FindOrAdd(Kind).Add(FTransform(FRotator(Pitch,Yaw,0),Local,Scale));
    }
    int32 Added=0;
    for(auto& Group:Groups)
    {
        const FString Key=Cell.Id+TEXT(":")+Group.Key;
        if(ResidentProps.Contains(Key))continue;
        auto* Instances=NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
        Instances->SetupAttachment(GetRootComponent());Instances->SetRelativeLocation(Cell.Center);
        Instances->SetStaticMesh(StreetMeshes.FindChecked(Group.Key));
        Instances->SetCollisionProfileName(TEXT("BlockAll"));
        Instances->SetCollisionEnabled(StreetCollision.FindChecked(Group.Key)?ECollisionEnabled::QueryAndPhysics:ECollisionEnabled::NoCollision);
        Instances->SetCanEverAffectNavigation(false); // Props do not yet own an NPC navmesh.
        Instances->SetCastShadow(true);
        Instances->SetCullDistances(StreetCullDistances.FindChecked(Group.Key)*.8f,StreetCullDistances.FindChecked(Group.Key));
        Instances->bAutoRebuildTreeOnInstanceChanges=false;
        Instances->RegisterComponent();
        Instances->AddInstances(Group.Value,false,false,false);
        Instances->BuildTreeIfOutdated(true,true);
        ResidentProps.Add(Key,Instances);Added+=Group.Value.Num();
    }
    StreetInstances+=Added;
    UE_LOG(LogTemp,Display,TEXT("PHILLY_STREET_CELL %s instances=%d components=%d rejected=%d total=%d"),*Cell.Id,Added,Groups.Num(),Rejected,StreetInstances);
}
void APhillyDistrict::ReleaseStreetProps(const FString& CellId)
{
    const FString Prefix=CellId+TEXT(":");
    for(auto It=ResidentProps.CreateIterator();It;++It)if(It.Key().StartsWith(Prefix))
    {StreetInstances-=It.Value()->GetInstanceCount();It.Value()->DestroyComponent();It.RemoveCurrent();}
}
void APhillyDistrict::RequestBackdrop()
{
    BackdropMaterial=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Philadelphia/Materials/M_DistrictBackdrop.M_DistrictBackdrop"));
    if(!BackdropMaterial){UE_LOG(LogTemp,Error,TEXT("PHILLY backdrop material missing"));return;}
    const TWeakObjectPtr<APhillyDistrict> Weak(this);
    Async(EAsyncExecution::ThreadPool,[Weak]()
    {
        TArray<uint8> Bytes;
        if(!FFileHelper::LoadFileToArray(Bytes,*(FPaths::ProjectContentDir()/TEXT("SourceData/district-backdrop.bin"))))
        {UE_LOG(LogTemp,Error,TEXT("PHILLY backdrop missing; run prepare_district_backdrop.py"));return;}
        if(Bytes.Num()<32 || FMemory::Memcmp(Bytes.GetData(),"PHLYLOD2",8)!=0)return;
        uint32 VertexCount=0,IndexCount=0;
        FMemory::Memcpy(&VertexCount,Bytes.GetData()+8,4);
        FMemory::Memcpy(&IndexCount,Bytes.GetData()+12,4);
        if(!VertexCount || !IndexCount || IndexCount%3 || uint64(Bytes.Num())!=32ull+uint64(VertexCount)*36+uint64(IndexCount)*4)return;
        float Bounds[4];FMemory::Memcpy(Bounds,Bytes.GetData()+16,16);
        for(float B:Bounds)if(!FMath::IsFinite(B))return;
        if(Bounds[2]<=Bounds[0] || Bounds[3]<=Bounds[1])return;
        TArray<FVector> Vertices,Normals;
        TArray<FVector2D> UV;
        TArray<FLinearColor> Colors;
        TArray<int32> Indices;
        Vertices.Reserve(VertexCount);Normals.Reserve(VertexCount);UV.Reserve(VertexCount);Colors.Reserve(VertexCount);Indices.Reserve(IndexCount);
        for(uint32 I=0;I<VertexCount;I++)
        {
            float V[9];FMemory::Memcpy(V,Bytes.GetData()+32+uint64(I)*36,36);
            for(float F:V)if(!FMath::IsFinite(F))return;
            Vertices.Add(FVector(V[0],V[1],V[2]));Normals.Add(FVector(V[3],V[4],V[5]));
            UV.Add(FVector2D((V[0]-Bounds[0])/(Bounds[2]-Bounds[0]),(V[1]-Bounds[1])/(Bounds[3]-Bounds[1])));Colors.Add(FLinearColor(V[6],V[7],V[8]));
        }
        for(uint32 I=0;I<IndexCount;I++)
        {
            uint32 Index=0;FMemory::Memcpy(&Index,Bytes.GetData()+32+uint64(VertexCount)*36+uint64(I)*4,4);
            if(Index>=VertexCount)return;Indices.Add(int32(Index));
        }
        AsyncTask(ENamedThreads::GameThread,[Weak,Vertices=MoveTemp(Vertices),Normals=MoveTemp(Normals),UV=MoveTemp(UV),Colors=MoveTemp(Colors),Indices=MoveTemp(Indices)]()
        {
            if(!Weak.IsValid())return;
            auto* Self=Weak.Get();
            auto* Mesh=NewObject<UProceduralMeshComponent>(Self);
            Mesh->SetupAttachment(Self->GetRootComponent());
            Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Mesh->SetCastShadow(false);Mesh->RegisterComponent();
            Mesh->CreateMeshSection_LinearColor(0,Vertices,Indices,Normals,UV,Colors,{},false);
            Mesh->SetMaterial(0,Self->BackdropMaterial);
            Self->Backdrop=Mesh;
            UE_LOG(LogTemp,Display,TEXT("PHILLY_BACKDROP sections=1 vertices=%d triangles=%d collision=0"),Vertices.Num(),Indices.Num()/3);
        });
    });
}
void APhillyDistrict::Tick(float Dt)
{
    Super::Tick(Dt);
    APawn* Player=UGameplayStatics::GetPlayerPawn(this,0);
    if(!Player)return;
    const FVector Focus=Player->GetActorLocation();
    if(!bPlayerReleased)
    {
        if(auto* Walker=Cast<APhillyCharacter>(Player))
        {
            Walker->GetCharacterMovement()->DisableMovement();
            FHitResult Ground;
            FCollisionQueryParams Query(SCENE_QUERY_STAT(PhillyReady),false,Player);
            if(GetWorld()->LineTraceSingleByChannel(Ground,Focus+FVector(0,0,100),Focus-FVector(0,0,200),ECC_Visibility,Query))
            {
                Walker->GetCharacterMovement()->SetMovementMode(MOVE_Walking);
                bPlayerReleased=true;
                UE_LOG(LogTemp,Display,TEXT("PHILLY source collision ready; player released"));
            }
        }
    }
    Timer-=Dt; if(Timer>0)return;Timer=.1f;
    TArray<FCell> Wanted;
    for(const auto& Cell:Cells) if(FVector::DistSquaredXY(Cell.Center,Focus)<FMath::Square(33000.f)) Wanted.Add(Cell);
    Wanted.Sort([Focus](const FCell& A,const FCell& B){return FVector::DistSquaredXY(A.Center,Focus)<FVector::DistSquaredXY(B.Center,Focus);});
    for(auto It=Resident.CreateIterator();It;++It)
    {
        const FCell* Cell=Cells.FindByPredicate([&](const FCell& C){return C.Id==It.Key();});
        if(Cell && FVector::DistSquaredXY(Cell->Center,Focus)>FMath::Square(48000.f))
        {ReleaseStreetProps(It.Key());if(auto* Detail=ResidentDetails.Find(It.Key())){(*Detail)->DestroyComponent();ResidentDetails.Remove(It.Key());}DetailFiles.Remove(It.Key());if(auto* Houses=ResidentHouses.Find(It.Key())){(*Houses)->DestroyComponent();ResidentHouses.Remove(It.Key());}It.Value()->DestroyComponent();It.RemoveCurrent();}
    }
    for(const auto& Cell:Wanted)
    {
        if(Pending.Num()>=2)break;
        if(!Resident.Contains(Cell.Id) && !Pending.Contains(Cell.Id) && !Failed.Contains(Cell.Id)) RequestCell(Cell);
    }
    // Hysteresis keeps a facade from oscillating at the stream boundary.
    for(auto It=ResidentDetails.CreateIterator();It;++It)
    {
        const FCell* Cell=Cells.FindByPredicate([&](const FCell& C){return C.Id==It.Key();});
        if(!Cell || DetailDistanceSquared(Cell->Center,Focus)>FMath::Square(HouseDetailRadius+3500.f))
        {
            if(auto* Base=ResidentHouses.Find(It.Key()))(*Base)->SetVisibility(true);
            It.Value()->DestroyComponent();It.RemoveCurrent();
        }
    }
    for(const auto& Cell:Wanted)
    {
        if(PendingDetails.Num()>=2)break;
        if(DetailDistanceSquared(Cell.Center,Focus)<FMath::Square(HouseDetailRadius) && DetailFiles.Contains(Cell.Id)
            && ResidentHouses.Contains(Cell.Id) && !ResidentDetails.Contains(Cell.Id)
            && !PendingDetails.Contains(Cell.Id) && !FailedDetails.Contains(Cell.Id))RequestHouseDetail(Cell);
    }
    ReadyCells=Resident.Num();
}
void APhillyDistrict::RequestCell(const FCell& Cell)
{
    Pending.Add(Cell.Id);
    const TWeakObjectPtr<APhillyDistrict> Weak(this);
    Async(EAsyncExecution::ThreadPool,[Weak,Cell]()
    {
        const auto Data=ReadSource(Cell.File);
        AsyncTask(ENamedThreads::GameThread,[Weak,Cell,Data]()
        {
            if(!Weak.IsValid())return;
            auto* Self=Weak.Get(); Self->Pending.Remove(Cell.Id);
            // A completed background read must not restore a cell left behind.
            const auto* Player=UGameplayStatics::GetPlayerPawn(Self,0);
            if(!Player || FVector::DistSquaredXY(Cell.Center,Player->GetActorLocation())>FMath::Square(48000.f))return;
            if(!Data) {Self->FailedCells++;Self->Failed.Add(Cell.Id);return;}
            auto* Mesh=NewObject<UProceduralMeshComponent>(Self);
            Mesh->SetupAttachment(Self->GetRootComponent());
            Mesh->bUseAsyncCooking=true;
            // Chaos cooks float vertices. Keep them close to each cell origin
            // instead of losing sub-millimetre precision at city coordinates.
            Mesh->SetRelativeLocation(Cell.Center);
            Mesh->bUseComplexAsSimpleCollision=true;
            Mesh->SetCollisionProfileName(TEXT("BlockAll"));
            // Broad terrain sheets receive shadows; they do not need to populate
            // virtual shadow maps as casters. Buildings/vehicles retain shadows.
            // Curbs currently share this mesh and consequently do not cast shadows.
            Mesh->SetCastShadow(false);
            Mesh->RegisterComponent();
            TArray<FVector> Vertices,Normals;
            TArray<int32> Indices;
            TArray<FVector2D> UV;
            TArray<FLinearColor> Colors;
            int32 RejectedTriangles=0;
            int32 RejectedPrecision=0;
            for(const auto& Pair:Data->GetObjectField(TEXT("groups"))->Values)
            {
                const auto& Values=Pair.Value->AsArray();
                if(Values.Num()==0 || Values.Num()%9) continue;
                for(int32 I=0;I<Values.Num();I+=9)
                {
                    FVector Points[3];
                    for(int32 J=0;J<3;J++) Points[J]=FVector(Values[I+J*3]->AsNumber(),Values[I+J*3+1]->AsNumber(),Values[I+J*3+2]->AsNumber());
                    const FVector Cross=FVector::CrossProduct(Points[2]-Points[0],Points[1]-Points[0]);
                    // Clipped sub-millimetre slivers cannot form useful contact faces.
                    if(Cross.SizeSquared()<.0001) {RejectedTriangles++;continue;}
                    const FVector3f A(Points[0]-Cell.Center),B(Points[1]-Cell.Center),C(Points[2]-Cell.Center);
                    if(A==B || A==C || B==C || FVector3f::CrossProduct(A-B,A-C).SizeSquared()<=UE_SMALL_NUMBER)
                    {RejectedPrecision++;continue;}
                    const FVector N=Cross.GetSafeNormal();
                    const int32 Base=Vertices.Num();
                    for(const FVector& V:Points)
                    {
                        Vertices.Add(V-Cell.Center); UV.Add(FVector2D(V.X/200,V.Y/200));
                        Colors.Add(SurfaceColor(Pair.Key)); Normals.Add(N);
                    }
                    Indices.Append({Base,Base+1,Base+2});
                }
            }
            // One shared vertex-colour material, one section, one collision cook.
            // Road paint relief is under 2cm, well below the 25cm character step.
            Mesh->CreateMeshSection_LinearColor(0,Vertices,Indices,Normals,UV,Colors,{},true);
            if(Self->SurfaceMaterial)Mesh->SetMaterial(0,Self->SurfaceMaterial);
            const TSharedPtr<FJsonObject>* Buildings=nullptr;
            if(!FParse::Param(FCommandLine::Get(),TEXT("PhillyNoHouses")) && Data->TryGetObjectField(TEXT("buildings"),Buildings))
            {
                const auto& P=(*Buildings)->GetArrayField(TEXT("positions"));const auto& N=(*Buildings)->GetArrayField(TEXT("normals"));
                const auto& C=(*Buildings)->GetArrayField(TEXT("colors"));const auto& U=(*Buildings)->GetArrayField(TEXT("uv"));const auto& IX=(*Buildings)->GetArrayField(TEXT("indices"));
                if(P.Num()%3==0 && N.Num()==P.Num() && C.Num()==P.Num()/3*4 && U.Num()==P.Num()/3*2 && IX.Num()%3==0)
                {
                    TArray<FVector> HP,HN;TArray<FVector2D> HU;TArray<FLinearColor> HC;TArray<int32> HI;bool Valid=true;
                    for(int32 I=0;I<P.Num()/3;I++)
                    {
                        FVector V(P[I*3]->AsNumber(),P[I*3+1]->AsNumber(),P[I*3+2]->AsNumber());
                        FVector Normal(N[I*3]->AsNumber(),N[I*3+1]->AsNumber(),N[I*3+2]->AsNumber());
                        if(V.ContainsNaN() || Normal.ContainsNaN()){Valid=false;break;}
                        HP.Add(V-Cell.Center);HN.Add(Normal);HU.Add(FVector2D(U[I*2]->AsNumber(),U[I*2+1]->AsNumber()));
                        HC.Add(FLinearColor(C[I*4]->AsNumber(),C[I*4+1]->AsNumber(),C[I*4+2]->AsNumber(),C[I*4+3]->AsNumber()));
                    }
                    for(const auto& Value:IX){const double Index=Value->AsNumber();if(Index<0 || Index>=HP.Num() || Index!=FMath::FloorToDouble(Index)){Valid=false;break;}HI.Add(int32(Index));}
                    if(Valid && HP.Num() && Self->HouseMaterial)
                    {
                        auto* Houses=NewObject<UProceduralMeshComponent>(Self);
                        Houses->SetupAttachment(Self->GetRootComponent());Houses->SetRelativeLocation(Cell.Center);
                        Houses->bUseAsyncCooking=true;Houses->bUseComplexAsSimpleCollision=true;
                        Houses->SetCollisionProfileName(TEXT("BlockAll"));Houses->SetCastShadow(true);Houses->RegisterComponent();
                        Houses->CreateMeshSection_LinearColor(0,HP,HI,HN,HU,HC,{},true);
                        Houses->SetMaterial(0,Self->HouseMaterial);Self->ResidentHouses.Add(Cell.Id,Houses);
                        UE_LOG(LogTemp,Display,TEXT("PHILLY_HOUSES cell=%s houses=%d triangles=%d"),*Cell.Id,(*Buildings)->GetArrayField(TEXT("sourceIds")).Num(),HI.Num()/3);
                    }
                    else UE_LOG(LogTemp,Error,TEXT("PHILLY_HOUSES invalid geometry or missing house material in %s"),*Cell.Id);
                }
            }
            FString DetailFile;
            if(Data->TryGetStringField(TEXT("houseDetailFile"),DetailFile) && !DetailFile.Contains(TEXT(".."))
                && !DetailFile.Contains(TEXT("/")) && !DetailFile.Contains(TEXT("\\")))
                Self->DetailFiles.Add(Cell.Id,FPaths::GetPath(Cell.File)/DetailFile);
            Self->Resident.Add(Cell.Id,Mesh);
            Self->CreateStreetProps(Cell,Data);
            UE_LOG(LogTemp,Display,TEXT("PHILLY_CELL %s sections=1 triangles=%d rejected_slivers=%d rejected_precision=%d"),*Cell.Id,Indices.Num()/3,RejectedTriangles,RejectedPrecision);
        });
    });
}

void APhillyDistrict::RequestHouseDetail(const FCell& Cell)
{
    const FString File=DetailFiles.FindChecked(Cell.Id);
    PendingDetails.Add(Cell.Id);
    const TWeakObjectPtr<APhillyDistrict> Weak(this);
    Async(EAsyncExecution::ThreadPool,[Weak,Cell,File]()
    {
        TArray<uint8> Bytes;
        TArray<FVector> HP,HN;TArray<FVector2D> HU;TArray<FLinearColor> HC;TArray<int32> HI;
        bool Valid=FFileHelper::LoadFileToArray(Bytes,*(FPaths::ProjectContentDir()/TEXT("SourceData")/File));
        uint32 Count=0,IndexCount=0;
        Valid=Valid && Bytes.Num()>=16 && FMemory::Memcmp(Bytes.GetData(),"PHLYHSE1",8)==0;
        if(Valid)
        {
            FMemory::Memcpy(&Count,Bytes.GetData()+8,4);FMemory::Memcpy(&IndexCount,Bytes.GetData()+12,4);
            Valid=Count>0 && Count<=MAX_int32 && IndexCount>0 && IndexCount<=MAX_int32 && IndexCount%3==0
                && uint64(Bytes.Num())==16ull+uint64(Count)*48+uint64(IndexCount)*4;
        }
        if(Valid)
        {
            HP.Reserve(Count);HN.Reserve(Count);HU.Reserve(Count);HC.Reserve(Count);HI.Reserve(IndexCount);
            for(uint32 I=0;I<Count;I++)
            {
                float V[12];FMemory::Memcpy(V,Bytes.GetData()+16+uint64(I)*48,48);
                for(float Value:V)if(!FMath::IsFinite(Value)){Valid=false;break;}
                if(!Valid)break;
                HP.Add(FVector(V[0],V[1],V[2]));HN.Add(FVector(V[3],V[4],V[5]));
                HC.Add(FLinearColor(V[6],V[7],V[8],V[9]));HU.Add(FVector2D(V[10],V[11]));
            }
            if(Valid)for(uint32 I=0;I<IndexCount;I++)
            {
                uint32 Index=0;FMemory::Memcpy(&Index,Bytes.GetData()+16+uint64(Count)*48+uint64(I)*4,4);
                if(Index>=Count){Valid=false;break;}HI.Add(int32(Index));
            }
        }
        // All IO, decoding and attribute validation finish on the worker thread.
        AsyncTask(ENamedThreads::GameThread,[Weak,Cell,Valid,HP=MoveTemp(HP),HN=MoveTemp(HN),HU=MoveTemp(HU),HC=MoveTemp(HC),HI=MoveTemp(HI)]()
        {
            if(!Weak.IsValid())return;
            auto* Self=Weak.Get();Self->PendingDetails.Remove(Cell.Id);
            const auto* Player=UGameplayStatics::GetPlayerPawn(Self,0);
            if(!Player || !Self->ResidentHouses.Contains(Cell.Id)
                || Self->ResidentDetails.Contains(Cell.Id)
                || DetailDistanceSquared(Cell.Center,Player->GetActorLocation())>FMath::Square(Self->HouseDetailRadius+3500.f))return;
            if(!Valid || !Self->HouseMaterial)
            {Self->FailedDetails.Add(Cell.Id);UE_LOG(LogTemp,Error,TEXT("PHILLY_DETAIL invalid binary %s; base retained"),*Cell.Id);return;}
            auto* Detail=NewObject<UProceduralMeshComponent>(Self);
            Detail->SetupAttachment(Self->GetRootComponent());Detail->SetRelativeLocation(Cell.Center);
            // Base walls retain their cooked collision throughout visual transitions.
            Detail->SetCollisionEnabled(ECollisionEnabled::NoCollision);Detail->SetCastShadow(true);Detail->RegisterComponent();
            Detail->CreateMeshSection_LinearColor(0,HP,HI,HN,HU,HC,{},false);Detail->SetMaterial(0,Self->HouseMaterial);
            Self->ResidentDetails.Add(Cell.Id,Detail);Self->ResidentHouses.FindChecked(Cell.Id)->SetVisibility(false);
            UE_LOG(LogTemp,Display,TEXT("PHILLY_DETAIL ready %s triangles=%d collision=base"),*Cell.Id,HI.Num()/3);
        });
    });
}
