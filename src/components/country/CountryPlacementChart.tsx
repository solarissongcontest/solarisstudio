import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CountryPlacementPoint = {
  edition: string;
  rank: number;
};

export default function CountryPlacementChart({ data }: { data: CountryPlacementPoint[] }) {
  return (
    <div className="h-[270px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="edition" stroke="var(--muted-foreground)" fontSize={11} />
          <YAxis reversed allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 14,
            }}
          />
          <Line
            type="monotone"
            dataKey="rank"
            name="Placement"
            stroke="var(--primary)"
            strokeWidth={3}
            dot
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
