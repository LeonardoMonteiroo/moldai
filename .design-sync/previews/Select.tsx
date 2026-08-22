import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "moldai-ui";

// Mirrors components/dashboard/PatternGrid.tsx's garment-type filter.
export const GarmentTypeFilter = () => (
  <Select open value="all" onValueChange={() => {}}>
    <SelectTrigger size="sm" className="w-[150px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="all">Todos os tipos</SelectItem>
        <SelectItem value="blouse">Blusa</SelectItem>
        <SelectItem value="dress">Vestido</SelectItem>
        <SelectItem value="skirt">Saia</SelectItem>
        <SelectItem value="tshirt">Camiseta</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
);

// Mirrors components/size-charts/SizeChartTable.tsx's body-type picker on a
// custom size chart's base row.
export const BodyType = () => (
  <Select open value="hourglass" onValueChange={() => {}}>
    <SelectTrigger size="sm" className="w-[170px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="straight">reto</SelectItem>
        <SelectItem value="hourglass">ampulheta</SelectItem>
        <SelectItem value="pear">pera</SelectItem>
        <SelectItem value="apple">maçã</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
);
