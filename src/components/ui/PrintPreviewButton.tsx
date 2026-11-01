import { Printer } from "lucide-react";
import type { ComponentProps } from "react";
import Button from "./Button";

type PrintPreviewButtonProps = Omit<ComponentProps<typeof Button>, "icon" | "variant" | "children">;

export default function PrintPreviewButton(props: PrintPreviewButtonProps) {
  return <Button variant="primary" icon={<Printer className="h-4 w-4" />} {...props}>Print Preview</Button>;
}
