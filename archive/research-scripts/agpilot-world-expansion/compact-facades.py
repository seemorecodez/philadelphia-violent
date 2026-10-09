from pathlib import Path
p=Path('Unreal/Philadelphia/Tools/build-south-houses.mjs');s=p.read_text();s="import {writeHouseMesh} from './house-mesh-binary.mjs';\n"+s;s=s.replace("c.id+'-houses.json'","c.id+'-houses.bin'").replace("await writeFile(out+'/'+detailFile,JSON.stringify({buildings:detailCells.get(c.id)}))","await writeHouseMesh(out+'/'+detailFile,detailCells.get(c.id),c)");p.write_text(s)
p=Path('Unreal/Philadelphia/Source/Philadelphia/PhillyDistrict.cpp');s=p.read_text();start=s.index('        const auto Data=ReadSource(File);',s.index('void APhillyDistrict::RequestHouseDetail'));end=s.index('            auto* Detail=NewObject',start)
s=s[:start]+'''        TArray<uint8> Bytes;
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
                || DetailDistanceSquared(Cell.Center,Player->GetActorLocation())>FMath::Square(18000.f))return;
            if(!Valid || !Self->HouseMaterial)
            {Self->FailedDetails.Add(Cell.Id);UE_LOG(LogTemp,Error,TEXT("PHILLY_DETAIL invalid binary %s; base retained"),*Cell.Id);return;}
''' +s[end:];p.write_text(s)
