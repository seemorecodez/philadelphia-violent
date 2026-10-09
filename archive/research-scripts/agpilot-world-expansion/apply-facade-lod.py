from pathlib import Path
p=Path('Unreal/Philadelphia/Tools/build-south-houses.mjs')
s=p.read_text()
s=s.replace('const cells=new Map(),skipped=[];let houses=0,triangles=0;', 'const cells=new Map(),detailCells=new Map(),skipped=[];let houses=0,triangles=0;')
s=s.replace(' const distance=Math.hypot(...localPoint([f.longitude,f.latitude]).map((v,i)=>v-spawn[i]));','')
s=s.replace(' const built=buildHouseGeometry({...f,polygons},{near:distance<125});if(!built){skipped.push({id:f.id,name:f.buildingName,height:f.height});continue;}\n const data=cells.get(f.cell)??', ' for(const near of [false,true]){\n const built=buildHouseGeometry({...f,polygons},{near});if(!built){if(!near)skipped.push({id:f.id,name:f.buildingName,height:f.height});continue;}\n const target=near?detailCells:cells;\n const data=target.get(f.cell)??')
s=s.replace('cells.set(f.cell,data);','target.set(f.cell,data);')
s=s.replace('data.sourceIds.push(f.id);houses++;triangles+=built.geometry.indices.length/3;','data.sourceIds.push(f.id);if(!near){houses++;triangles+=built.geometry.indices.length/3;}\n }')
s=s.replace("if(cells.has(c.id))data.buildings=cells.get(c.id);await writeFile(path,JSON.stringify(data));", "if(cells.has(c.id))data.buildings=cells.get(c.id);else delete data.buildings;\n const detailFile=c.id+'-houses.json';\n if(detailCells.has(c.id)){data.houseDetailFile=detailFile;await writeFile(out+'/'+detailFile,JSON.stringify({buildings:detailCells.get(c.id)}));}else delete data.houseDetailFile;\n await writeFile(path,JSON.stringify(data));")
p.write_text(s)
p=Path('Unreal/Philadelphia/Source/Philadelphia/PhillyDistrict.h');s=p.read_text().replace('    TSet<FString> Pending;', '    UPROPERTY() TMap<FString,TObjectPtr<UProceduralMeshComponent>> ResidentDetails;\n    TMap<FString,FString> DetailFiles;\n    TSet<FString> PendingDetails;\n    TSet<FString> FailedDetails;\n    void RequestHouseDetail(const FCell& Cell);\n    TSet<FString> Pending;');p.write_text(s)
p=Path('Unreal/Philadelphia/Source/Philadelphia/PhillyDistrict.cpp');s=p.read_text()
s=s.replace('FLinearColor SurfaceColor', '''// Distance to a 100m cell footprint, including camera elevation for aerial LOD.
float DetailDistanceSquared(const FVector& Center,const FVector& Focus)
{
    const float X=FMath::Max(0.0,FMath::Abs(Focus.X-Center.X)-5000.0);
    const float Y=FMath::Max(0.0,FMath::Abs(Focus.Y-Center.Y)-5000.0);
    return X*X+Y*Y;
}
FLinearColor SurfaceColor''')
# Detail distance deliberately XY: terrain elevation differs by cell and center Z is zero.
s=s.replace('// Distance to a 100m cell footprint, including camera elevation for aerial LOD.', '// Horizontal distance to a 100m cell footprint; centers have no terrain Z.')
s=s.replace('{if(auto* Houses=ResidentHouses.Find(It.Key()))', '{if(auto* Detail=ResidentDetails.Find(It.Key())){(*Detail)->DestroyComponent();ResidentDetails.Remove(It.Key());}DetailFiles.Remove(It.Key());if(auto* Houses=ResidentHouses.Find(It.Key()))')
s=s.replace('    ReadyCells=Resident.Num();', '''    // Hysteresis keeps a facade from oscillating at the stream boundary.
    for(auto It=ResidentDetails.CreateIterator();It;++It)
    {
        const FCell* Cell=Cells.FindByPredicate([&](const FCell& C){return C.Id==It.Key();});
        if(!Cell || DetailDistanceSquared(Cell->Center,Focus)>FMath::Square(18000.f))
        {
            if(auto* Base=ResidentHouses.Find(It.Key()))(*Base)->SetVisibility(true);
            It.Value()->DestroyComponent();It.RemoveCurrent();
        }
    }
    for(const auto& Cell:Wanted)
    {
        if(PendingDetails.Num()>=2)break;
        if(DetailDistanceSquared(Cell.Center,Focus)<FMath::Square(13000.f) && DetailFiles.Contains(Cell.Id)
            && ResidentHouses.Contains(Cell.Id) && !ResidentDetails.Contains(Cell.Id)
            && !PendingDetails.Contains(Cell.Id) && !FailedDetails.Contains(Cell.Id))RequestHouseDetail(Cell);
    }
    ReadyCells=Resident.Num();''')
s=s.replace('            Self->Resident.Add(Cell.Id,Mesh);', '''            FString DetailFile;
            if(Data->TryGetStringField(TEXT("houseDetailFile"),DetailFile) && !DetailFile.Contains(TEXT(".."))
                && !DetailFile.Contains(TEXT("/")) && !DetailFile.Contains(TEXT("\\\\")))
                Self->DetailFiles.Add(Cell.Id,FPaths::GetPath(Cell.File)/DetailFile);
            Self->Resident.Add(Cell.Id,Mesh);''')
s+='''
void APhillyDistrict::RequestHouseDetail(const FCell& Cell)
{
    const FString File=DetailFiles.FindChecked(Cell.Id);
    PendingDetails.Add(Cell.Id);
    const TWeakObjectPtr<APhillyDistrict> Weak(this);
    Async(EAsyncExecution::ThreadPool,[Weak,Cell,File]()
    {
        const auto Data=ReadSource(File);
        AsyncTask(ENamedThreads::GameThread,[Weak,Cell,Data]()
        {
            if(!Weak.IsValid())return;
            auto* Self=Weak.Get();Self->PendingDetails.Remove(Cell.Id);
            const auto* Player=UGameplayStatics::GetPlayerPawn(Self,0);
            if(!Player || !Self->ResidentHouses.Contains(Cell.Id)
                || Self->ResidentDetails.Contains(Cell.Id)
                || DetailDistanceSquared(Cell.Center,Player->GetActorLocation())>FMath::Square(18000.f))return;
            const TSharedPtr<FJsonObject>* B=nullptr;
            if(!Data || !Data->TryGetObjectField(TEXT("buildings"),B))
            {Self->FailedDetails.Add(Cell.Id);UE_LOG(LogTemp,Error,TEXT("PHILLY_DETAIL read failed %s; base retained"),*Cell.Id);return;}
            const auto& P=(*B)->GetArrayField(TEXT("positions"));const auto& N=(*B)->GetArrayField(TEXT("normals"));
            const auto& C=(*B)->GetArrayField(TEXT("colors"));const auto& U=(*B)->GetArrayField(TEXT("uv"));
            const auto& IX=(*B)->GetArrayField(TEXT("indices"));
            bool Valid=P.Num()>0 && P.Num()%3==0 && N.Num()==P.Num() && C.Num()==P.Num()/3*4 && U.Num()==P.Num()/3*2 && IX.Num()%3==0;
            TArray<FVector> HP,HN;TArray<FVector2D> HU;TArray<FLinearColor> HC;TArray<int32> HI;
            if(Valid)for(int32 I=0;I<P.Num()/3;I++)
            {
                FVector V(P[I*3]->AsNumber(),P[I*3+1]->AsNumber(),P[I*3+2]->AsNumber());
                FVector Normal(N[I*3]->AsNumber(),N[I*3+1]->AsNumber(),N[I*3+2]->AsNumber());
                if(V.ContainsNaN() || Normal.ContainsNaN()){Valid=false;break;}
                HP.Add(V-Cell.Center);HN.Add(Normal);HU.Add(FVector2D(U[I*2]->AsNumber(),U[I*2+1]->AsNumber()));
                HC.Add(FLinearColor(C[I*4]->AsNumber(),C[I*4+1]->AsNumber(),C[I*4+2]->AsNumber(),C[I*4+3]->AsNumber()));
            }
            if(Valid)for(const auto& Value:IX)
            {const double I=Value->AsNumber();if(!FMath::IsFinite(I) || I<0 || I>=HP.Num() || I!=FMath::FloorToDouble(I)){Valid=false;break;}HI.Add(int32(I));}
            if(!Valid || !Self->HouseMaterial){Self->FailedDetails.Add(Cell.Id);return;}
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
'''
p.write_text(s)
