import {
	Video as UpgradeVideoCamera,
	VideoOff as UpgradeVideoCameraSlash,
	AlignLeft as UpgradeAlignLeft,
	AlignCenter as UpgradeAlignCenterHorizontal,
	AlignRight as UpgradeAlignRight,
	Type as UpgradeTextAa,
	Scan as UpgradeFrameCorners,
	Eraser as UpgradeEraser,
	Contrast as UpgradeCircleHalf,
	Filter as UpgradeFunnel,
	EllipsisVertical as UpgradeDotsThreeVertical,
	FileCode as UpgradeFileCss,
	FileCode as UpgradeFileHtml,
	FileCode as UpgradeFileJs,
	Play as UpgradePlay,
} from "lucide-react";
import {
	Scan as LucideScan,
	Package as LucidePackage,
	Combine as LucideCombine,
	Split as LucideSplit,
	AlignHorizontalSpaceAround as LucideHorizontalSpace,
} from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";
import {
	AlignCenter as LucideAlignCenter,
	AlignLeft as LucideAlignLeft,
	AlignRight as LucideAlignRight,
	Archive as LucideArchive,
	ArrowDown as LucideArrowDown,
	ArrowLeft as LucideArrowLeft,
	ArrowLeftRight as LucideArrowLeftRight,
	ArrowRight as LucideArrowRight,
	ArrowUp as LucideArrowUp,
	ArrowUpRight as LucideArrowUpRight,
	Ban as LucideBan,
	Bell as LucideBell,
	Bold as LucideBold,
	BookOpen as LucideBookOpen,
	Bot as LucideBot,
	Box as LucideBox,
	Braces as LucideBraces,
	Cable as LucideCable,
	Calendar as LucideCalendar,
	CalendarDays as LucideCalendarDays,
	CalendarPlus as LucideCalendarPlus,
	CalendarX2 as LucideCalendarX2,
	ChartColumn as LucideChartColumn,
	ChartLine as LucideChartLine,
	Check as LucideCheck,
	ChevronDown as LucideChevronDown,
	ChevronLeft as LucideChevronLeft,
	ChevronRight as LucideChevronRight,
	ChevronUp as LucideChevronUp,
	ChevronsLeft as LucideChevronsLeft,
	ChevronsRight as LucideChevronsRight,
	ChevronsUpDown as LucideChevronsUpDown,
	CircleAlert as LucideCircleAlert,
	CircleArrowUp as LucideCircleArrowUp,
	CircleCheck as LucideCircleCheck,
	CircleDashed as LucideCircleDashed,
	CircleHelp as LucideCircleHelp,
	CircleMinus as LucideCircleMinus,
	CircleUser as LucideCircleUser,
	CircleX as LucideCircleX,
	Clock as LucideClock,
	Cloud as LucideCloud,
	Code as LucideCode,
	CodeXml as LucideCodeXml,
	Columns3 as LucideColumns3,
	Copy as LucideCopy,
	Crop as LucideCrop,
	Database as LucideDatabase,
	Download as LucideDownload,
	Earth as LucideEarth,
	Ellipsis as LucideEllipsis,
	ExternalLink as LucideExternalLink,
	Eye as LucideEye,
	EyeOff as LucideEyeOff,
	File as LucideFile,
	FileAudio as LucideFileAudio,
	FileDown as LucideFileDown,
	FileImage as LucideFileImage,
	FileText as LucideFileText,
	FileUp as LucideFileUp,
	FileVideoCamera as LucideFileVideoCamera,
	FileX2 as LucideFileX2,
	Files as LucideFiles,
	Fingerprint as LucideFingerprint,
	Folder as LucideFolder,
	FolderOpen as LucideFolderOpen,
	Folders as LucideFolders,
	Globe as LucideGlobe,
	Grid2x2 as LucideGrid2x2,
	GripVertical as LucideGripVertical,
	HardDrive as LucideHardDrive,
	Hash as LucideHash,
	Heading as LucideHeading,
	Heading1 as LucideHeading1,
	Heading2 as LucideHeading2,
	Heading3 as LucideHeading3,
	Heading4 as LucideHeading4,
	Heading5 as LucideHeading5,
	Heading6 as LucideHeading6,
	History as LucideHistory,
	IdCard as LucideIdCard,
	Image as LucideImage,
	ImageOff as LucideImageOff,
	Images as LucideImages,
	Info as LucideInfo,
	Italic as LucideItalic,
	Key as LucideKey,
	Languages as LucideLanguages,
	Layers as LucideLayers,
	LayoutGrid as LucideLayoutGrid,
	Link as LucideLink,
	List as LucideList,
	ListChecks as LucideListChecks,
	ListOrdered as LucideListOrdered,
	LoaderCircle as LucideLoaderCircle,
	LockKeyhole as LucideLockKeyhole,
	LogOut as LucideLogOut,
	Mail as LucideMail,
	Maximize2 as LucideMaximize2,
	Medal as LucideMedal,
	MessagesSquare as LucideMessagesSquare,
	Minimize2 as LucideMinimize2,
	Minus as LucideMinus,
	Moon as LucideMoon,
	Newspaper as LucideNewspaper,
	Palette as LucidePalette,
	PanelsTopLeft as LucidePanelsTopLeft,
	Paperclip as LucidePaperclip,
	Pencil as LucidePencil,
	Pilcrow as LucidePilcrow,
	Plug as LucidePlug,
	Plus as LucidePlus,
	Puzzle as LucidePuzzle,
	Quote as LucideQuote,
	Redo2 as LucideRedo2,
	RefreshCw as LucideRefreshCw,
	RotateCcw as LucideRotateCcw,
	RotateCw as LucideRotateCw,
	Route as LucideRoute,
	Rows3 as LucideRows3,
	Ruler as LucideRuler,
	Save as LucideSave,
	Search as LucideSearch,
	Send as LucideSend,
	Settings as LucideSettings,
	Share2 as LucideShare2,
	Shield as LucideShield,
	ShieldAlert as LucideShieldAlert,
	ShieldCheck as LucideShieldCheck,
	Signature as LucideSignature,
	SlidersHorizontal as LucideSlidersHorizontal,
	Smartphone as LucideSmartphone,
	Sparkles as LucideSparkles,
	SquareCode as LucideSquareCode,
	Star as LucideStar,
	Store as LucideStore,
	Strikethrough as LucideStrikethrough,
	Subscript as LucideSubscript,
	Sun as LucideSun,
	Superscript as LucideSuperscript,
	Table as LucideTable,
	Tag as LucideTag,
	Timer as LucideTimer,
	ToggleLeft as LucideToggleLeft,
	Trash as LucideTrash,
	TriangleAlert as LucideTriangleAlert,
	Trophy as LucideTrophy,
	Type as LucideType,
	Underline as LucideUnderline,
	Undo2 as LucideUndo2,
	Unlink as LucideUnlink,
	Upload as LucideUpload,
	Usb as LucideUsb,
	User as LucideUser,
	UserMinus as LucideUserMinus,
	UserPlus as LucideUserPlus,
	Users as LucideUsers,
	Webhook as LucideWebhook,
	X as LucideX,
} from "lucide-react";
import { createContext, forwardRef, useContext } from "react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";

export interface IconProps extends LucideProps {
	weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
	mirrored?: boolean;
	alt?: string;
}
export type Icon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;
const ICON_CONTEXT_KEY = Symbol.for("emdash:lucide-icon-context");
type IconContextGlobals = typeof globalThis & {
	[ICON_CONTEXT_KEY]?: ReturnType<typeof createContext<IconProps>>;
};
const iconGlobals = globalThis as IconContextGlobals;
export const IconContext = (iconGlobals[ICON_CONTEXT_KEY] ??= createContext<IconProps>({}));

export const Columns = /* @__PURE__ */ wrap(LucideColumns3);
export const Package = /* @__PURE__ */ wrap(LucidePackage);
export const SelectionAll = /* @__PURE__ */ wrap(LucideScan);
export const RowsPlusTop = /* @__PURE__ */ wrap(LucideRows3);
export const ColumnsPlusLeft = /* @__PURE__ */ wrap(LucideColumns3);
export const Union = /* @__PURE__ */ wrap(LucideCombine);
export const Intersect = /* @__PURE__ */ wrap(LucideSplit);
export const ArrowsInLineHorizontal = /* @__PURE__ */ wrap(LucideHorizontalSpace);
export const ArrowsOutLineHorizontal = /* @__PURE__ */ wrap(LucideHorizontalSpace);
export const ArrowsHorizontal = /* @__PURE__ */ wrap(LucideHorizontalSpace);

function wrap(Component: LucideIcon): Icon {
	return forwardRef<SVGSVGElement, IconProps>((props, ref) => {
		const context = useContext(IconContext);
		const { weight, mirrored, alt, strokeWidth, style, ...rest } = { ...context, ...props };
		const width =
			strokeWidth ??
			(weight === "bold" || weight === "fill"
				? 2.5
				: weight === "thin"
					? 1
					: weight === "light"
						? 1.5
						: 2);
		const imageStyle = mirrored
			? { ...style, transform: `scaleX(-1) ${style?.transform ?? ""}` }
			: style;
		return (
			<Component
				ref={ref}
				strokeWidth={width}
				aria-label={rest["aria-label"] ?? alt}
				style={imageStyle}
				{...rest}
			/>
		);
	});
}

export const Archive = /* @__PURE__ */ wrap(LucideArchive);
export const ArrowCircleUp = /* @__PURE__ */ wrap(LucideCircleArrowUp);
export const ArrowClockwise = /* @__PURE__ */ wrap(LucideRotateCw);
export const ArrowCounterClockwise = /* @__PURE__ */ wrap(LucideRotateCcw);
export const ArrowDown = /* @__PURE__ */ wrap(LucideArrowDown);
export const ArrowLeft = /* @__PURE__ */ wrap(LucideArrowLeft);
export const ArrowRight = /* @__PURE__ */ wrap(LucideArrowRight);
export const ArrowRightIcon = /* @__PURE__ */ wrap(LucideArrowRight);
export const ArrowSquareOut = /* @__PURE__ */ wrap(LucideExternalLink);
export const ArrowSquareOutIcon = /* @__PURE__ */ wrap(LucideExternalLink);
export const ArrowUUpLeft = /* @__PURE__ */ wrap(LucideUndo2);
export const ArrowUUpRight = /* @__PURE__ */ wrap(LucideRedo2);
export const ArrowUp = /* @__PURE__ */ wrap(LucideArrowUp);
export const ArrowUpRight = /* @__PURE__ */ wrap(LucideArrowUpRight);
export const ArrowsClockwise = /* @__PURE__ */ wrap(LucideRefreshCw);
export const ArrowsInSimple = /* @__PURE__ */ wrap(LucideMinimize2);
export const ArrowsLeftRight = /* @__PURE__ */ wrap(LucideArrowLeftRight);
export const ArrowsOutSimple = /* @__PURE__ */ wrap(LucideMaximize2);
export const Bell = /* @__PURE__ */ wrap(LucideBell);
export const BookOpen = /* @__PURE__ */ wrap(LucideBookOpen);
export const BracketsAngle = /* @__PURE__ */ wrap(LucideCodeXml);
export const BracketsCurly = /* @__PURE__ */ wrap(LucideBraces);
export const Browser = /* @__PURE__ */ wrap(LucidePanelsTopLeft);
export const Calendar = /* @__PURE__ */ wrap(LucideCalendar);
export const CalendarBlank = /* @__PURE__ */ wrap(LucideCalendar);
export const CalendarDots = /* @__PURE__ */ wrap(LucideCalendarDays);
export const CalendarPlus = /* @__PURE__ */ wrap(LucideCalendarPlus);
export const CalendarX = /* @__PURE__ */ wrap(LucideCalendarX2);
export const CardsThree = /* @__PURE__ */ wrap(LucidePanelsTopLeft);
export const CaretDoubleLeftIcon = /* @__PURE__ */ wrap(LucideChevronsLeft);
export const CaretDoubleRightIcon = /* @__PURE__ */ wrap(LucideChevronsRight);
export const CaretDown = /* @__PURE__ */ wrap(LucideChevronDown);
export const CaretDownIcon = /* @__PURE__ */ wrap(LucideChevronDown);
export const CaretLeftIcon = /* @__PURE__ */ wrap(LucideChevronLeft);
export const CaretRight = /* @__PURE__ */ wrap(LucideChevronRight);
export const CaretRightIcon = /* @__PURE__ */ wrap(LucideChevronRight);
export const CaretUp = /* @__PURE__ */ wrap(LucideChevronUp);
export const CaretUpDown = /* @__PURE__ */ wrap(LucideChevronsUpDown);
export const CaretUpDownIcon = /* @__PURE__ */ wrap(LucideChevronsUpDown);
export const ChartBar = /* @__PURE__ */ wrap(LucideChartColumn);
export const ChartLine = /* @__PURE__ */ wrap(LucideChartLine);
export const Chats = /* @__PURE__ */ wrap(LucideMessagesSquare);
export const Check = /* @__PURE__ */ wrap(LucideCheck);
export const CheckCircle = /* @__PURE__ */ wrap(LucideCircleCheck);
export const CheckIcon = /* @__PURE__ */ wrap(LucideCheck);
export const CircleDashed = /* @__PURE__ */ wrap(LucideCircleDashed);
export const CircleNotch = /* @__PURE__ */ wrap(LucideLoaderCircle);
export const Clock = /* @__PURE__ */ wrap(LucideClock);
export const ClockCountdown = /* @__PURE__ */ wrap(LucideTimer);
export const ClockCounterClockwise = /* @__PURE__ */ wrap(LucideHistory);
export const Cloud = /* @__PURE__ */ wrap(LucideCloud);
export const Code = /* @__PURE__ */ wrap(LucideCode);
export const CodeBlock = /* @__PURE__ */ wrap(LucideSquareCode);
export const ColumnsPlusRight = /* @__PURE__ */ wrap(LucideColumns3);
export const Copy = /* @__PURE__ */ wrap(LucideCopy);
export const CopyIcon = /* @__PURE__ */ wrap(LucideCopy);
export const Crop = /* @__PURE__ */ wrap(LucideCrop);
export const Cube = /* @__PURE__ */ wrap(LucideBox);
export const Database = /* @__PURE__ */ wrap(LucideDatabase);
export const DeviceMobile = /* @__PURE__ */ wrap(LucideSmartphone);
export const DotsSixVertical = /* @__PURE__ */ wrap(LucideGripVertical);
export const DotsThree = /* @__PURE__ */ wrap(LucideEllipsis);
export const Download = /* @__PURE__ */ wrap(LucideDownload);
export const DownloadSimple = /* @__PURE__ */ wrap(LucideDownload);
export const Envelope = /* @__PURE__ */ wrap(LucideMail);
export const EnvelopeSimple = /* @__PURE__ */ wrap(LucideMail);
export const Eye = /* @__PURE__ */ wrap(LucideEye);
export const EyeSlash = /* @__PURE__ */ wrap(LucideEyeOff);
export const Faders = /* @__PURE__ */ wrap(LucideSlidersHorizontal);
export const File = /* @__PURE__ */ wrap(LucideFile);
export const FileArrowDown = /* @__PURE__ */ wrap(LucideFileDown);
export const FileArrowUp = /* @__PURE__ */ wrap(LucideFileUp);
export const FileAudio = /* @__PURE__ */ wrap(LucideFileAudio);
export const FileImage = /* @__PURE__ */ wrap(LucideFileImage);
export const FilePdf = /* @__PURE__ */ wrap(LucideFileText);
export const FileText = /* @__PURE__ */ wrap(LucideFileText);
export const FileVideo = /* @__PURE__ */ wrap(LucideFileVideoCamera);
export const FileX = /* @__PURE__ */ wrap(LucideFileX2);
export const Files = /* @__PURE__ */ wrap(LucideFiles);
export const Fingerprint = /* @__PURE__ */ wrap(LucideFingerprint);
export const FloppyDisk = /* @__PURE__ */ wrap(LucideSave);
export const Folder = /* @__PURE__ */ wrap(LucideFolder);
export const FolderOpen = /* @__PURE__ */ wrap(LucideFolderOpen);
export const FolderSimple = /* @__PURE__ */ wrap(LucideFolder);
export const Folders = /* @__PURE__ */ wrap(LucideFolders);
export const Gear = /* @__PURE__ */ wrap(LucideSettings);
export const GithubLogo = /* @__PURE__ */ wrap(LucideExternalLink);
export const Globe = /* @__PURE__ */ wrap(LucideGlobe);
export const GlobeHemisphereWestIcon = /* @__PURE__ */ wrap(LucideEarth);
export const GlobeSimple = /* @__PURE__ */ wrap(LucideGlobe);
export const GridFour = /* @__PURE__ */ wrap(LucideGrid2x2);
export const HardDrive = /* @__PURE__ */ wrap(LucideHardDrive);
export const Hash = /* @__PURE__ */ wrap(LucideHash);
export const IdentificationCard = /* @__PURE__ */ wrap(LucideIdCard);
export const Image = /* @__PURE__ */ wrap(LucideImage);
export const ImageBroken = /* @__PURE__ */ wrap(LucideImageOff);
export const ImageSquare = /* @__PURE__ */ wrap(LucideImage);
export const Images = /* @__PURE__ */ wrap(LucideImages);
export const ImagesSquare = /* @__PURE__ */ wrap(LucideImages);
export const Info = /* @__PURE__ */ wrap(LucideInfo);
export const Key = /* @__PURE__ */ wrap(LucideKey);
export const Link = /* @__PURE__ */ wrap(LucideLink);
export const LinkBreak = /* @__PURE__ */ wrap(LucideUnlink);
export const LinkSimple = /* @__PURE__ */ wrap(LucideLink);
export const List = /* @__PURE__ */ wrap(LucideList);
export const ListBullets = /* @__PURE__ */ wrap(LucideList);
export const ListChecks = /* @__PURE__ */ wrap(LucideListChecks);
export const ListNumbers = /* @__PURE__ */ wrap(LucideListOrdered);
export const LockKey = /* @__PURE__ */ wrap(LucideLockKeyhole);
export const MagnifyingGlass = /* @__PURE__ */ wrap(LucideSearch);
export const MagnifyingGlassIcon = /* @__PURE__ */ wrap(LucideSearch);
export const Medal = /* @__PURE__ */ wrap(LucideMedal);
export const Minus = /* @__PURE__ */ wrap(LucideMinus);
export const MinusCircle = /* @__PURE__ */ wrap(LucideCircleMinus);
export const MinusIcon = /* @__PURE__ */ wrap(LucideMinus);
export const Moon = /* @__PURE__ */ wrap(LucideMoon);
export const Newspaper = /* @__PURE__ */ wrap(LucideNewspaper);
export const Palette = /* @__PURE__ */ wrap(LucidePalette);
export const PaperPlaneTilt = /* @__PURE__ */ wrap(LucideSend);
export const Paperclip = /* @__PURE__ */ wrap(LucidePaperclip);
export const Paragraph = /* @__PURE__ */ wrap(LucidePilcrow);
export const Path = /* @__PURE__ */ wrap(LucideRoute);
export const Pencil = /* @__PURE__ */ wrap(LucidePencil);
export const PencilSimple = /* @__PURE__ */ wrap(LucidePencil);
export const Plug = /* @__PURE__ */ wrap(LucidePlug);
export const PlugsConnected = /* @__PURE__ */ wrap(LucideCable);
export const Plus = /* @__PURE__ */ wrap(LucidePlus);
export const Prohibit = /* @__PURE__ */ wrap(LucideBan);
export const PuzzlePiece = /* @__PURE__ */ wrap(LucidePuzzle);
export const Question = /* @__PURE__ */ wrap(LucideCircleHelp);
export const Quotes = /* @__PURE__ */ wrap(LucideQuote);
export const Robot = /* @__PURE__ */ wrap(LucideBot);
export const Rows = /* @__PURE__ */ wrap(LucideRows3);
export const RowsPlusBottom = /* @__PURE__ */ wrap(LucideRows3);
export const Ruler = /* @__PURE__ */ wrap(LucideRuler);
export const ShareNetwork = /* @__PURE__ */ wrap(LucideShare2);
export const Shield = /* @__PURE__ */ wrap(LucideShield);
export const ShieldCheck = /* @__PURE__ */ wrap(LucideShieldCheck);
export const ShieldWarning = /* @__PURE__ */ wrap(LucideShieldAlert);
export const SignOut = /* @__PURE__ */ wrap(LucideLogOut);
export const Signature = /* @__PURE__ */ wrap(LucideSignature);
export const SlidersHorizontal = /* @__PURE__ */ wrap(LucideSlidersHorizontal);
export const Sparkle = /* @__PURE__ */ wrap(LucideSparkles);
export const SquaresFour = /* @__PURE__ */ wrap(LucideLayoutGrid);
export const Stack = /* @__PURE__ */ wrap(LucideLayers);
export const StackSimple = /* @__PURE__ */ wrap(LucideLayers);
export const Star = /* @__PURE__ */ wrap(LucideStar);
export const Storefront = /* @__PURE__ */ wrap(LucideStore);
export const Sun = /* @__PURE__ */ wrap(LucideSun);
export const Table = /* @__PURE__ */ wrap(LucideTable);
export const Tag = /* @__PURE__ */ wrap(LucideTag);
export const TextAlignCenter = /* @__PURE__ */ wrap(LucideAlignCenter);
export const TextAlignLeft = /* @__PURE__ */ wrap(LucideAlignLeft);
export const TextAlignRight = /* @__PURE__ */ wrap(LucideAlignRight);
export const TextB = /* @__PURE__ */ wrap(LucideBold);
export const TextH = /* @__PURE__ */ wrap(LucideHeading);
export const TextHFive = /* @__PURE__ */ wrap(LucideHeading5);
export const TextHFour = /* @__PURE__ */ wrap(LucideHeading4);
export const TextHOne = /* @__PURE__ */ wrap(LucideHeading1);
export const TextHSix = /* @__PURE__ */ wrap(LucideHeading6);
export const TextHThree = /* @__PURE__ */ wrap(LucideHeading3);
export const TextHTwo = /* @__PURE__ */ wrap(LucideHeading2);
export const TextItalic = /* @__PURE__ */ wrap(LucideItalic);
export const TextStrikethrough = /* @__PURE__ */ wrap(LucideStrikethrough);
export const TextSubscript = /* @__PURE__ */ wrap(LucideSubscript);
export const TextSuperscript = /* @__PURE__ */ wrap(LucideSuperscript);
export const TextT = /* @__PURE__ */ wrap(LucideType);
export const TextUnderline = /* @__PURE__ */ wrap(LucideUnderline);
export const ToggleLeft = /* @__PURE__ */ wrap(LucideToggleLeft);
export const Translate = /* @__PURE__ */ wrap(LucideLanguages);
export const Trash = /* @__PURE__ */ wrap(LucideTrash);
export const Trophy = /* @__PURE__ */ wrap(LucideTrophy);
export const Upload = /* @__PURE__ */ wrap(LucideUpload);
export const UploadSimple = /* @__PURE__ */ wrap(LucideUpload);
export const Usb = /* @__PURE__ */ wrap(LucideUsb);
export const User = /* @__PURE__ */ wrap(LucideUser);
export const UserCircle = /* @__PURE__ */ wrap(LucideCircleUser);
export const UserCircleIcon = /* @__PURE__ */ wrap(LucideCircleUser);
export const UserMinus = /* @__PURE__ */ wrap(LucideUserMinus);
export const UserPlus = /* @__PURE__ */ wrap(LucideUserPlus);
export const Users = /* @__PURE__ */ wrap(LucideUsers);
export const Warning = /* @__PURE__ */ wrap(LucideTriangleAlert);
export const WarningCircle = /* @__PURE__ */ wrap(LucideCircleAlert);
export const WarningCircleIcon = /* @__PURE__ */ wrap(LucideCircleAlert);
export const WebhooksLogo = /* @__PURE__ */ wrap(LucideWebhook);
export const WindowsLogo = /* @__PURE__ */ wrap(LucidePanelsTopLeft);
export const X = /* @__PURE__ */ wrap(LucideX);
export const XCircle = /* @__PURE__ */ wrap(LucideCircleX);
export const XIcon = /* @__PURE__ */ wrap(LucideX);
export const YoutubeLogo = /* @__PURE__ */ wrap(LucideExternalLink);

export const VideoCamera = /* @__PURE__ */ wrap(UpgradeVideoCamera);
export const VideoCameraSlash = /* @__PURE__ */ wrap(UpgradeVideoCameraSlash);
export const AlignLeft = /* @__PURE__ */ wrap(UpgradeAlignLeft);
export const AlignCenterHorizontal = /* @__PURE__ */ wrap(UpgradeAlignCenterHorizontal);
export const AlignRight = /* @__PURE__ */ wrap(UpgradeAlignRight);
export const TextAa = /* @__PURE__ */ wrap(UpgradeTextAa);
export const FrameCorners = /* @__PURE__ */ wrap(UpgradeFrameCorners);
export const Eraser = /* @__PURE__ */ wrap(UpgradeEraser);
export const CircleHalf = /* @__PURE__ */ wrap(UpgradeCircleHalf);
export const Funnel = /* @__PURE__ */ wrap(UpgradeFunnel);
export const DotsThreeVertical = /* @__PURE__ */ wrap(UpgradeDotsThreeVertical);
export const FileCss = /* @__PURE__ */ wrap(UpgradeFileCss);
export const FileHtml = /* @__PURE__ */ wrap(UpgradeFileHtml);
export const FileJs = /* @__PURE__ */ wrap(UpgradeFileJs);
export const Play = /* @__PURE__ */ wrap(UpgradePlay);
