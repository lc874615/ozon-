import argparse,json
from pathlib import Path
from .official_market_export import import_official_market_export

def main():
    p=argparse.ArgumentParser(description="Offline single-competitor official-report import")
    p.add_argument("input");p.add_argument("--sku",required=True)
    p.add_argument("--confirmed-period-days",type=int,choices=[28]);p.add_argument("--output",required=True)
    args=p.parse_args()
    report=import_official_market_export(args.input,args.sku,args.confirmed_period_days)
    destination=Path(args.output);destination.parent.mkdir(parents=True,exist_ok=True)
    temp=destination.with_name(destination.name+".tmp")
    temp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    temp.replace(destination)
    print(report["status"]+"; no network or account operations")
if __name__=="__main__":main()
