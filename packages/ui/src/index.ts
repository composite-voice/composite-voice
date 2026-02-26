/* ═══════════════════════════════════════════════════
   CompositeVoice UI — Design System Components
   ═══════════════════════════════════════════════════ */

/* ── Brand ────────────────────────────────────── */
export { BrandName } from "./components/BrandName";
export type { BrandNameProps } from "./components/BrandName";

/* ── Primitives ───────────────────────────────── */
export { VisuallyHidden } from "./components/VisuallyHidden";
export { Text } from "./components/Text";
export { Heading } from "./components/Heading";
export { Icon } from "./components/Icon";

/* ── Icons ────────────────────────────────────── */
export {
  /* Brand */
  BrandIcon,
  /* Informational */
  InfoIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  HelpCircleIcon,
  XCircleIcon,
  /* Actions */
  XIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  TrashIcon,
  EditIcon,
  DownloadIcon,
  UploadIcon,
  RefreshCwIcon,
  ShareIcon,
  SaveIcon,
  LogInIcon,
  LogOutIcon,
  /* Navigation */
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  RotateCwIcon,
  RotateCcwIcon,
  /* Theme */
  SunIcon,
  MoonIcon,
  MonitorIcon,
  /* Media */
  PlayIcon,
  PauseIcon,
  StopIcon,
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  VolumeXIcon,
  ImageIcon,
  CameraIcon,
  /* Communication */
  PhoneIcon,
  MessageCircleIcon,
  SendIcon,
  BellIcon,
  BellOffIcon,
  /* Objects */
  HomeIcon,
  CalendarIcon,
  ClockIcon,
  StarIcon,
  HeartIcon,
  BookmarkIcon,
  FilterIcon,
  LockIcon,
  UnlockIcon,
  GlobeIcon,
  LinkIcon,
  MapPinIcon,
  TagIcon,
  ClipboardIcon,
  ShieldIcon,
  FlagIcon,
  AwardIcon,
  /* Development */
  CodeIcon,
  TerminalIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  DatabaseIcon,
  GitBranchIcon,
  ZapIcon,
  /* People */
  UsersIcon,
  UserPlusIcon,
  UserMinusIcon,
  /* Layout / UI */
  GridIcon,
  ListIcon,
  LayoutIcon,
  MaximizeIcon,
  MinimizeIcon,
  SlidersIcon,
  ColumnsIcon,
  /* Shapes / Preference */
  CircleIcon,
  SquareIcon,
  ContrastIcon,
  LayersIcon,
  /* Commerce */
  ShoppingCartIcon,
  CreditCardIcon,
  PackageIcon,
  /* Social / Interaction */
  ThumbsUpIcon,
  ThumbsDownIcon,
  SmileIcon,
  FrownIcon,
  /* Misc */
  LoaderIcon,
  ExternalLinkIcon,
  MenuIcon,
  MailIcon,
  UserIcon,
  SettingsIcon,
  HashIcon,
  AtSignIcon,
  PaperclipIcon,
  WifiIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  PrintIcon,
  /* Social / Brand */
  GitHubIcon,
} from "./icons";

/* ── Buttons ──────────────────────────────────── */
export { Button } from "./components/Button";
export type { ButtonProps } from "./components/Button";
export { ButtonGroup } from "./components/ButtonGroup";
export { IconButton } from "./components/IconButton";

/* ── Feedback ─────────────────────────────────── */
export { Alert } from "./components/Alert";
export { Badge } from "./components/Badge";
export { Banner } from "./components/Banner";

/* ── Forms ────────────────────────────────────── */
export { Label } from "./components/Label";
export { Input } from "./components/Input";
export { Textarea } from "./components/Textarea";
export { Select } from "./components/Select";
export { Checkbox } from "./components/Checkbox";
export { Radio } from "./components/Radio";
export { FormField } from "./components/FormField";

/* ── Data Display ─────────────────────────────── */
export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardImage,
  CardTitle,
  CardDescription,
} from "./components/Card";
export {
  Table,
  TableCaption,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "./components/Table";

/* ── Loading ──────────────────────────────────── */
export { Spinner } from "./components/Spinner";
export { Skeleton } from "./components/Skeleton";
export { ProgressBar } from "./components/ProgressBar";

/* ── Overlays ─────────────────────────────────── */
export { Tooltip } from "./components/Tooltip";
export { Modal, ModalHeader, ModalBody, ModalFooter } from "./components/Modal";

/* ── Navigation ───────────────────────────────── */
export { Tabs, TabList, Tab, TabPanel } from "./components/Tabs";
export { Pagination } from "./components/Pagination";

/* ── Design System Display ────────────────────── */
export { ColorSwatch, ColorPalette } from "./components/ColorSwatch";

/* ── Preferences ─────────────────────────────── */
export { getPreferences, getPreference, setPreference } from "./preferences";
export type { Preferences } from "./preferences";
export { ThemeToggle } from "./components/ThemeToggle";
export { ContrastToggle } from "./components/ContrastToggle";
export { MotionToggle } from "./components/MotionToggle";
export { TransparencyToggle } from "./components/TransparencyToggle";
export { FontSizeToggle } from "./components/FontSizeToggle";
export { PreferencesPanel } from "./components/PreferencesPanel";

/* ── Layout ──────────────────────────────────── */
export { Navbar } from "./components/Navbar";
export type { NavbarProps, NavbarSite } from "./components/Navbar";
export { Sidebar } from "./components/Sidebar";
export type {
  SidebarProps,
  SidebarItem,
  SidebarLink,
  SidebarGroup,
  /** @deprecated Use `SidebarLink` or `SidebarItem` instead. */
  SidebarSection,
} from "./components/Sidebar";
export { Footer } from "./components/Footer";
export type { FooterProps, FooterSite } from "./components/Footer";

/* ── Code & Prose ────────────────────────────── */
export { CopyCommand } from "./components/CopyCommand";
export { Code } from "./components/Code";
export { CodeBlock } from "./components/CodeBlock";
export { CodeTabs } from "./components/CodeTabs";
export { Blockquote } from "./components/Blockquote";
export { Kbd } from "./components/Kbd";
export { Mark } from "./components/Mark";
export { Prose } from "./components/Prose";
