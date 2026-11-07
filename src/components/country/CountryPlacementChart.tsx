import { NativeLineChart } from "@/components/viz/NativeLineChart";

type CountryPlacementPoint = {
  edition: string;
  rank: number;
};

export default function CountryPlacementChart({ data }: { data: CountryPlacementPoint[] }) {
  return (
    <div className="h-[270px]">
      <NativeLineChart
        data={data}
        xKey="edition"
        reversed
        yTickFormatter={(value) => String(Math.round(value))}
        ariaLabel="Country placements by edition, with better ranks at the top"
        series={[{
          key: "rank",
          name: "Placement",
          stroke: "var(--primary)",
          strokeWidth: 3,
        }]}
      />
    </div>
  );
}
