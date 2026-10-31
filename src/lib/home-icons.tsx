/** Home-page icons: Hugeicons, one stroke colour (currentColor). Names follow the Phosphor/lucide icons they replaced. */
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon, AiBrain02Icon, AiMagicIcon, ArrowDown01Icon, ArrowExpandIcon, ArrowLeft01Icon, ArrowReloadHorizontalIcon, ArrowRight01Icon, ArrowUp01Icon, ArrowUpRight01Icon,
  AudioWave01Icon, Call02Icon, Cancel01Icon, Comment01Icon, Copy01Icon, CpuIcon, Delete02Icon, DragDropVerticalIcon, Edit02Icon,
  File01Icon, FlashIcon, FolderClosedIcon, FolderOpenIcon, GlobalIcon, HelpCircleIcon, HistoryIcon, LaptopMinimalIcon, Layers01Icon, LayoutIcon, LeftToRightListNumberIcon, Loading03Icon,
  Message02Icon, MessageMultiple02Icon, MinusSignIcon, MoreHorizontalIcon, PauseIcon, Search01Icon, Settings02Icon, Shield01Icon, StopIcon, ThumbsDownIcon, ThumbsUpIcon,
  Tick02Icon, UnfoldMoreIcon, VolumeHighIcon, Wrench01Icon, BookOpen01Icon, TextAlignLeft01Icon,
} from '@hugeicons/core-free-icons';
import { forwardRef, type ComponentType, type SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string; weight?: string; strokeWidth?: number; color?: string; mirrored?: boolean };
export type Icon = ComponentType<IconProps>;

function make(icon: IconSvgElement, label: string): Icon {
  const C = forwardRef<SVGSVGElement, IconProps>(({ size = 16, weight: _w, mirrored: _m, strokeWidth = 1.8, ...rest }, ref) => (
    <HugeiconsIcon ref={ref} icon={icon} size={size} strokeWidth={strokeWidth} {...(rest as object)} />
  ));
  C.displayName = label;
  return C;
}

export const ArrowCounterClockwise = make(ArrowReloadHorizontalIcon, 'ArrowCounterClockwise');
export const ArrowLeft = make(ArrowLeft01Icon, 'ArrowLeft');
export const ArrowRight = make(ArrowRight01Icon, 'ArrowRight');
export const ArrowSquareOut = make(ArrowUpRight01Icon, 'ArrowSquareOut');
export const ArrowUp = make(ArrowUp01Icon, 'ArrowUp');
export const ArrowsOut = make(ArrowExpandIcon, 'ArrowsOut');
export const Brain = make(AiBrain02Icon, 'Brain');
export const CaretDown = make(ArrowDown01Icon, 'CaretDown');
export const CaretRight = make(ArrowRight01Icon, 'CaretRight');
export const CaretUpDown = make(UnfoldMoreIcon, 'CaretUpDown');
export const ChatCircle = make(MessageMultiple02Icon, 'ChatCircle');
export const ChatText = make(Comment01Icon, 'ChatText');
export const ChatsCircle = make(Message02Icon, 'ChatsCircle');
export const Check = make(Tick02Icon, 'Check');
export const CircleNotch = make(Loading03Icon, 'CircleNotch');
export const Copy = make(Copy01Icon, 'Copy');
export const Cpu = make(CpuIcon, 'Cpu');
export const DotsSixVertical = make(DragDropVerticalIcon, 'DotsSixVertical');
export const DotsThree = make(MoreHorizontalIcon, 'DotsThree');
export const FileText = make(File01Icon, 'FileText');
export const FolderOpen = make(FolderOpenIcon, 'FolderOpen');
export const FolderSimple = make(FolderClosedIcon, 'FolderSimple');
export const Gear = make(Settings02Icon, 'Gear');
export const Globe = make(GlobalIcon, 'Globe');
export const History = make(HistoryIcon, 'History');
export const LaptopMinimal = make(LaptopMinimalIcon, 'LaptopMinimal');
export const Layout = make(LayoutIcon, 'Layout');
export const Lightning = make(FlashIcon, 'Lightning');
export const ListNumbers = make(LeftToRightListNumberIcon, 'ListNumbers');
export const MagnifyingGlass = make(Search01Icon, 'MagnifyingGlass');
export const Minus = make(MinusSignIcon, 'Minus');
export const Pause = make(PauseIcon, 'Pause');
export const Pencil = make(Edit02Icon, 'Pencil');
export const PhoneDisconnect = make(Call02Icon, 'PhoneDisconnect');
export const Plus = make(Add01Icon, 'Plus');
export const Question = make(HelpCircleIcon, 'Question');
export const ShieldWarning = make(Shield01Icon, 'ShieldWarning');
export const Sparkle = make(AiMagicIcon, 'Sparkle');
export const SpeakerHigh = make(VolumeHighIcon, 'SpeakerHigh');
export const Stack = make(Layers01Icon, 'Stack');
export const Stop = make(StopIcon, 'Stop');
export const Trash = make(Delete02Icon, 'Trash');
export const Waveform = make(AudioWave01Icon, 'Waveform');
export const Wrench = make(Wrench01Icon, 'Wrench');
export const X = make(Cancel01Icon, 'X');
/* from lucide */
export const Library = make(BookOpen01Icon, 'Library');
export const Summary = make(TextAlignLeft01Icon, 'Summary');
export const ThumbsUp = make(ThumbsUpIcon, 'ThumbsUp');
export const ThumbsDown = make(ThumbsDownIcon, 'ThumbsDown');
