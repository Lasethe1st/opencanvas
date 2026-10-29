import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  AtIcon,
  Cancel01Icon,
  ClipboardIcon,
  CloudBackupIcon,
  CodeIcon,
  Copy01Icon,
  Copy02Icon,
  CornerLeftUpIcon,
  Cursor01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  File01Icon,
  FileCodeIcon,
  FocusIcon,
  Folder01Icon,
  FolderSearchIcon,
  FrameIcon,
  GitBranchIcon,
  Globe02Icon,
  Grid02Icon,
  Heading01Icon,
  Image01Icon,
  LaptopIcon,
  Layers01Icon,
  Layout01Icon,
  Layout3ColumnIcon,
  Link01Icon,
  Link02Icon,
  ListViewIcon,
  Message01Icon,
  MessageAdd01Icon,
  MinusSignIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  MoveVerticalIcon,
  Package01Icon,
  PaletteIcon,
  PanelBottomIcon,
  PanelTopIcon,
  ParagraphIcon,
  PlayIcon,
  RectangleHorizontalIcon,
  Redo02Icon,
  RefreshIcon,
  Route01Icon,
  RulerIcon,
  ScanSearchIcon,
  Search01Icon,
  SmartPhone01Icon,
  SparklesIcon,
  SquareIcon,
  MaximizeScreenIcon,
  MinimizeScreenIcon,
  Cursor02Icon,
  SwatchBookIcon,
  Tablet01Icon,
  Tick02Icon,
  TypeCursorIcon,
  TypeIcon,
  Undo02Icon,
  ViewIcon
} from '@hugeicons/core-free-icons';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

/**
 * Hugeicons (free set) under the names the canvas chrome already uses, so a screen switches icon sets by changing one import.
 * Same props as before: size, strokeWidth, className, aria-*.
 */
type IconProps = Omit<ComponentPropsWithoutRef<'svg'>, 'ref'> & { size?: number | string; strokeWidth?: number; absoluteStrokeWidth?: boolean; fill?: string };

function make(icon: IconSvgElement, label: string) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(({ size = 16, strokeWidth = 1.6, absoluteStrokeWidth: _a, ...rest }, ref) => (
    <HugeiconsIcon ref={ref} icon={icon} size={Number(size)} strokeWidth={strokeWidth} {...(rest as object)} />
  ));
  Icon.displayName = label;
  return Icon;
}

export const ArrowDown = make(ArrowDown01Icon, 'ArrowDown');
export const ArrowUp = make(ArrowUp01Icon, 'ArrowUp');
export const AtSign = make(AtIcon, 'AtSign');
export const Check = make(Tick02Icon, 'Check');
export const ChevronDown = make(ArrowDown01Icon, 'ChevronDown');
export const ChevronRight = make(ArrowRight01Icon, 'ChevronRight');
export const ChevronUp = make(ArrowUp01Icon, 'ChevronUp');
export const ClipboardList = make(ClipboardIcon, 'ClipboardList');
export const CloudSync = make(CloudBackupIcon, 'CloudSync');
export const Code2 = make(CodeIcon, 'Code2');
export const Columns3 = make(Layout3ColumnIcon, 'Columns3');
export const Copy = make(Copy01Icon, 'Copy');
export const CornerLeftUp = make(CornerLeftUpIcon, 'CornerLeftUp');
export const Download = make(Download01Icon, 'Download');
export const Eye = make(ViewIcon, 'Eye');
export const FileCode2 = make(FileCodeIcon, 'FileCode2');
export const FileText = make(File01Icon, 'FileText');
export const Focus = make(FocusIcon, 'Focus');
export const FolderOpen = make(Folder01Icon, 'FolderOpen');
export const FolderSearch = make(FolderSearchIcon, 'FolderSearch');
export const Frame = make(FrameIcon, 'Frame');
export const GitBranch = make(GitBranchIcon, 'GitBranch');
export const GlobeCheck = make(Globe02Icon, 'GlobeCheck');
export const Heading = make(Heading01Icon, 'Heading');
export const Image = make(Image01Icon, 'Image');
export const Laptop = make(LaptopIcon, 'Laptop');
export const Layers = make(Layers01Icon, 'Layers');
export const LayoutGrid = make(Grid02Icon, 'LayoutGrid');
export const LayoutTemplate = make(Layout01Icon, 'LayoutTemplate');
export const Link = make(Link01Icon, 'Link');
export const Link2 = make(Link02Icon, 'Link2');
export const List = make(ListViewIcon, 'List');
export const Maximize = make(MaximizeScreenIcon, 'Maximize');
export const Maximize2 = make(MaximizeScreenIcon, 'Maximize2');
export const MessageSquarePlus = make(MessageAdd01Icon, 'MessageSquarePlus');
export const MessageSquareText = make(Message01Icon, 'MessageSquareText');
export const Minimize2 = make(MinimizeScreenIcon, 'Minimize2');
export const Minus = make(MinusSignIcon, 'Minus');
export const Monitor = make(MonitorIcon, 'Monitor');
export const MoreHorizontal = make(MoreHorizontalIcon, 'MoreHorizontal');
export const MousePointer2 = make(Cursor01Icon, 'MousePointer2');
export const MoveVertical = make(MoveVerticalIcon, 'MoveVertical');
export const Navigation = make(Cursor02Icon, 'Navigation');
export const PackageOpen = make(Package01Icon, 'PackageOpen');
export const Palette = make(PaletteIcon, 'Palette');
export const PanelBottom = make(PanelBottomIcon, 'PanelBottom');
export const PanelTop = make(PanelTopIcon, 'PanelTop');
export const Pencil = make(Edit02Icon, 'Pencil');
export const Pilcrow = make(ParagraphIcon, 'Pilcrow');
export const Play = make(PlayIcon, 'Play');
export const Plus = make(Add01Icon, 'Plus');
export const RectangleHorizontal = make(RectangleHorizontalIcon, 'RectangleHorizontal');
export const Redo2 = make(Redo02Icon, 'Redo2');
export const RefreshCw = make(RefreshIcon, 'RefreshCw');
export const Ruler = make(RulerIcon, 'Ruler');
export const ScanSearch = make(ScanSearchIcon, 'ScanSearch');
export const Search = make(Search01Icon, 'Search');
export const Smartphone = make(SmartPhone01Icon, 'Smartphone');
export const Sparkles = make(SparklesIcon, 'Sparkles');
export const Square = make(SquareIcon, 'Square');
export const SquareStack = make(Copy02Icon, 'SquareStack');
export const SwatchBook = make(SwatchBookIcon, 'SwatchBook');
export const Tablet = make(Tablet01Icon, 'Tablet');
export const TextCursorInput = make(TypeCursorIcon, 'TextCursorInput');
export const Trash2 = make(Delete02Icon, 'Trash2');
export const Type = make(TypeIcon, 'Type');
export const Undo2 = make(Undo02Icon, 'Undo2');
export const Waypoints = make(Route01Icon, 'Waypoints');
export const X = make(Cancel01Icon, 'X');
