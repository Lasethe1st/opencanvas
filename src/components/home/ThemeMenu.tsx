import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "../../../shared/types";
import { setThemePreference, useTheme } from "../../lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

/** System / Light / Dark. The choice is shared with the workspace and saved locally. */
export function ThemeMenu({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { preference, resolved } = useTheme();
  const Icon =
    preference === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={className} aria-label="Theme">
          <Icon />
          {children}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={document.dir === 'rtl' ? 'left' : 'right'} align="end" className="min-w-[160px]">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) =>
            setThemePreference(value as ThemePreference)
          }
        >
          {OPTIONS.map(({ id, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <ItemIcon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
