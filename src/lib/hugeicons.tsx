import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon,
  Alert01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  AtIcon,
  BotIcon,
  BoxIcon,
  Bug01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  ClipboardIcon,
  CloudBackupIcon,
  CloudUploadIcon,
  CodeIcon,
  Compass01Icon,
  Copy01Icon,
  Copy02Icon,
  CornerLeftUpIcon,
  CrosshairIcon,
  CubeIcon,
  Cursor01Icon,
  Cursor02Icon,
  CursorPointer01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  File01Icon,
  FileAddIcon,
  FileCodeIcon,
  FlashIcon,
  FloppyDiskIcon,
  FocusIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderSearchIcon,
  FrameIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  Globe02Icon,
  GridViewIcon,
  Heading01Icon,
  HelpCircleIcon,
  Home01Icon,
  Image01Icon,
  InformationCircleIcon,
  LaptopIcon,
  Layers01Icon,
  Layout01Icon,
  Layout3ColumnIcon,
  Link01Icon,
  Link02Icon,
  ListViewIcon,
  MagicWand01Icon,
  MaximizeScreenIcon,
  Message01Icon,
  MessageAdd01Icon,
  MinimizeScreenIcon,
  MinusSignIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  MoveIcon,
  MoveVerticalIcon,
  News01Icon,
  Package01Icon,
  PaletteIcon,
  PanelBottomIcon,
  PanelTopIcon,
  ParagraphIcon,
  PlayIcon,
  RectangleHorizontalIcon,
  Redo02Icon,
  RefreshIcon,
  RotateCcwIcon,
  RotateClockwiseIcon,
  Route01Icon,
  RulerIcon,
  ScanSearchIcon,
  Search01Icon,
  ShapesIcon,
  SmartPhone01Icon,
  SparklesIcon,
  SquareArrowUpRightIcon,
  SquareIcon,
  SwatchBookIcon,
  Table01Icon,
  Tablet01Icon,
  TerminalIcon,
  TextAlignCenterIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextFontIcon,
  Tick02Icon,
  Timer01Icon,
  TypeCursorIcon,
  TypeIcon,
  Undo02Icon,
  Unlink01Icon,
  Unlink02Icon,
  Upload01Icon,
  Video01Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import { forwardRef, type ComponentPropsWithoutRef, type ComponentType } from 'react';

/**
 * Hugeicons (free set) under the names the canvas chrome already uses, so a screen switches icon sets by changing one import.
 * Same props as before: size, strokeWidth, className, aria-*.
 */
type IconProps = Omit<ComponentPropsWithoutRef<'svg'>, 'ref'> & { size?: number | string; strokeWidth?: number; absoluteStrokeWidth?: boolean; fill?: string; /** Phosphor-style props, accepted and ignored: Hugeicons' free set is stroke-only. */ weight?: string; mirrored?: boolean };
/** Stand-in for Phosphor's `Icon` type. */
export type Icon = ComponentType<IconProps>;

function make(icon: IconSvgElement, label: string, defaultSize: number | string = 16) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(({ size = defaultSize, strokeWidth = 1.6, absoluteStrokeWidth: _a, weight: _w, mirrored: _m, ...rest }, ref) => (
    <HugeiconsIcon ref={ref} icon={icon} size={size} strokeWidth={strokeWidth} {...(rest as object)} />
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
export const LayoutGrid = make(GridViewIcon, 'LayoutGrid');
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

/* Names the panels used from Phosphor; these inherit the surrounding font size like Phosphor did. */
export const ArrowCounterClockwise = make(RotateCcwIcon, 'ArrowCounterClockwise', '1em');
export const ArrowSquareOut = make(SquareArrowUpRightIcon, 'ArrowSquareOut', '1em');
export const ArrowsOutCardinal = make(MoveIcon, 'ArrowsOutCardinal', '1em');
export const Article = make(News01Icon, 'Article', '1em');
export const Bot = make(BotIcon, 'Bot', '1em');
export const Box = make(BoxIcon, 'Box', '1em');
export const Bug = make(Bug01Icon, 'Bug', '1em');
export const CaretDown = make(ArrowDown01Icon, 'CaretDown', '1em');
export const CaretRight = make(ArrowRight01Icon, 'CaretRight', '1em');
export const CircleCheck = make(CheckmarkCircle02Icon, 'CircleCheck', '1em');
export const CircleX = make(CancelCircleIcon, 'CircleX', '1em');
export const CloudUpload = make(CloudUploadIcon, 'CloudUpload', '1em');
export const Code = make(CodeIcon, 'Code', '1em');
export const Columns = make(Layout3ColumnIcon, 'Columns', '1em');
export const Compass = make(Compass01Icon, 'Compass', '1em');
export const Crosshair = make(CrosshairIcon, 'Crosshair', '1em');
export const Cube = make(CubeIcon, 'Cube', '1em');
export const CursorClick = make(CursorPointer01Icon, 'CursorClick', '1em');
export const ExternalLink = make(SquareArrowUpRightIcon, 'ExternalLink', '1em');
export const EyeSlash = make(ViewOffIcon, 'EyeSlash', '1em');
export const File = make(File01Icon, 'File', '1em');
export const FileCode = make(FileCodeIcon, 'FileCode', '1em');
export const FilePlus = make(FileAddIcon, 'FilePlus', '1em');
export const FloppyDisk = make(FloppyDiskIcon, 'FloppyDisk', '1em');
export const Folder = make(Folder01Icon, 'Folder', '1em');
export const FolderPlus = make(FolderAddIcon, 'FolderPlus', '1em');
export const GitCommitHorizontal = make(GitCommitHorizontalIcon, 'GitCommitHorizontal', '1em');
export const Home = make(Home01Icon, 'Home', '1em');
export const Info = make(InformationCircleIcon, 'Info', '1em');
export const Layout = make(Layout01Icon, 'Layout', '1em');
export const Lightning = make(FlashIcon, 'Lightning', '1em');
export const Link2Off = make(Unlink02Icon, 'Link2Off', '1em');
export const LinkBreak = make(Unlink01Icon, 'LinkBreak', '1em');
export const ListBullets = make(ListViewIcon, 'ListBullets', '1em');
export const MagicWand = make(MagicWand01Icon, 'MagicWand', '1em');
export const MagnifyingGlass = make(Search01Icon, 'MagnifyingGlass', '1em');
export const PencilSimple = make(Edit02Icon, 'PencilSimple', '1em');
export const Question = make(HelpCircleIcon, 'Question', '1em');
export const Rectangle = make(RectangleHorizontalIcon, 'Rectangle', '1em');
export const RotateCw = make(RotateClockwiseIcon, 'RotateCw', '1em');
export const Shapes = make(ShapesIcon, 'Shapes', '1em');
export const Sparkle = make(SparklesIcon, 'Sparkle', '1em');
export const SquaresFour = make(GridViewIcon, 'SquaresFour', '1em');
export const Table = make(Table01Icon, 'Table', '1em');
export const Terminal = make(TerminalIcon, 'Terminal', '1em');
export const TextAa = make(TextFontIcon, 'TextAa', '1em');
export const TextAlignCenter = make(TextAlignCenterIcon, 'TextAlignCenter', '1em');
export const TextAlignJustify = make(TextAlignJustifyIcon, 'TextAlignJustify', '1em');
export const TextAlignLeft = make(TextAlignLeftIcon, 'TextAlignLeft', '1em');
export const TextAlignRight = make(TextAlignRightIcon, 'TextAlignRight', '1em');
export const TextT = make(TextFontIcon, 'TextT', '1em');
export const Textbox = make(TypeCursorIcon, 'Textbox', '1em');
export const Timer = make(Timer01Icon, 'Timer', '1em');
export const Trash = make(Delete02Icon, 'Trash', '1em');
export const TriangleAlert = make(Alert01Icon, 'TriangleAlert', '1em');
export const UploadSimple = make(Upload01Icon, 'UploadSimple', '1em');
export const VideoCamera = make(Video01Icon, 'VideoCamera', '1em');
