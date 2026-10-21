import type {CarbonIconType} from '@carbon/icons-react';
import {cn} from '@/lib/lime/utils';

// The one place Lime imports icons from. Components import from here, never from the icon package, so
// the set can be swapped in one file.
export {
  Add, ArrowDown, ArrowRight, ArrowUp, Attachment, Checkmark, CheckmarkFilled, ChevronDown, ChevronRight,
  ChevronSort, ChevronUp, Close, Copy, ErrorFilled, Image, Information, Menu, Play, Receipt, Renew, Search,
  Send, Subtract, Time, Upload, Wallet, PiggyBank, Warning, WarningFilled, ChevronLeft, ArrowLeft, Pause,
  OverflowMenuHorizontal, Folder, FolderOpen, Star, Add as Plus, Delete, Cafe, ShoppingBag, Notification, Locked, Undo, Edit, CircleDash,
  Location, Chat, RecentlyViewed, Document, DocumentBlank, Template, MagicWand, SidePanelOpen, SidePanelClose, LogoGithub, Application,
  AiGenerate, ColorPalette, Sun, Moon, Laptop, Plug, Keyboard, Password, TrashCan, WarningAlt, Settings, Connect,
  Archive, Tools, Cursor_1 as Cursor, Draggable, TextAlignLeft, TextAlignCenter, TextAlignRight, TextAlignJustify,
  Code, Maximize, Minimize, Ruler, SquareOutline, TextScale, Link, List as ListGlyph, StringText, TextNewLine,
  Column, Grid, Heading, Paragraph, ButtonCentered, Box, FolderAdd, DocumentAdd, Move, CenterToFit,
  AlignHorizontalLeft, OpenPanelLeft, OpenPanelRight, PanHorizontal, TextCreation, TextLongParagraph,
} from '@carbon/icons-react';

export type LimeIcon = CarbonIconType;

type IconProps = Omit<React.ComponentProps<CarbonIconType>, 'size'> & {
  icon: LimeIcon;
  size?: 12 | 16 | 20 | 24 | 32;
  label?: string;
};

export function Icon({icon: Glyph, size = 16, label, className, ...props}: IconProps) {
  return <Glyph
    size={size}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? 'img' : undefined}
    className={cn('shrink-0', className)}
    {...props}
  />;
}
