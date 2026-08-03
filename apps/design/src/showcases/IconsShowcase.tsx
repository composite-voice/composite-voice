import { useState } from "react";
import {
  Heading,
  Text,
  Code,
  CodeBlock,
  Input,
  SearchIcon,
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
  UserIcon,
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
  MenuIcon,
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
  MailIcon,
  SettingsIcon,
  HashIcon,
  AtSignIcon,
  PaperclipIcon,
  WifiIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  PrintIcon,
} from "composite-voice-ui";

type IconEntry = {
  name: string;
  component: React.ComponentType<{ size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }>;
  category: string;
};

const icons: IconEntry[] = [
  /* Informational */
  { name: "InfoIcon", component: InfoIcon, category: "Informational" },
  { name: "CheckCircleIcon", component: CheckCircleIcon, category: "Informational" },
  { name: "AlertTriangleIcon", component: AlertTriangleIcon, category: "Informational" },
  { name: "AlertCircleIcon", component: AlertCircleIcon, category: "Informational" },
  { name: "HelpCircleIcon", component: HelpCircleIcon, category: "Informational" },
  { name: "XCircleIcon", component: XCircleIcon, category: "Informational" },
  /* Actions */
  { name: "XIcon", component: XIcon, category: "Actions" },
  { name: "CheckIcon", component: CheckIcon, category: "Actions" },
  { name: "MinusIcon", component: MinusIcon, category: "Actions" },
  { name: "PlusIcon", component: PlusIcon, category: "Actions" },
  { name: "SearchIcon", component: SearchIcon, category: "Actions" },
  { name: "EyeIcon", component: EyeIcon, category: "Actions" },
  { name: "EyeOffIcon", component: EyeOffIcon, category: "Actions" },
  { name: "CopyIcon", component: CopyIcon, category: "Actions" },
  { name: "TrashIcon", component: TrashIcon, category: "Actions" },
  { name: "EditIcon", component: EditIcon, category: "Actions" },
  { name: "DownloadIcon", component: DownloadIcon, category: "Actions" },
  { name: "UploadIcon", component: UploadIcon, category: "Actions" },
  { name: "RefreshCwIcon", component: RefreshCwIcon, category: "Actions" },
  { name: "ShareIcon", component: ShareIcon, category: "Actions" },
  { name: "SaveIcon", component: SaveIcon, category: "Actions" },
  { name: "LogInIcon", component: LogInIcon, category: "Actions" },
  { name: "LogOutIcon", component: LogOutIcon, category: "Actions" },
  /* Navigation */
  { name: "ChevronLeftIcon", component: ChevronLeftIcon, category: "Navigation" },
  { name: "ChevronRightIcon", component: ChevronRightIcon, category: "Navigation" },
  { name: "ChevronDownIcon", component: ChevronDownIcon, category: "Navigation" },
  { name: "ChevronUpIcon", component: ChevronUpIcon, category: "Navigation" },
  { name: "ChevronsLeftIcon", component: ChevronsLeftIcon, category: "Navigation" },
  { name: "ChevronsRightIcon", component: ChevronsRightIcon, category: "Navigation" },
  { name: "ArrowLeftIcon", component: ArrowLeftIcon, category: "Navigation" },
  { name: "ArrowRightIcon", component: ArrowRightIcon, category: "Navigation" },
  { name: "ArrowUpIcon", component: ArrowUpIcon, category: "Navigation" },
  { name: "ArrowDownIcon", component: ArrowDownIcon, category: "Navigation" },
  { name: "RotateCwIcon", component: RotateCwIcon, category: "Navigation" },
  { name: "RotateCcwIcon", component: RotateCcwIcon, category: "Navigation" },
  /* Theme */
  { name: "SunIcon", component: SunIcon, category: "Theme" },
  { name: "MoonIcon", component: MoonIcon, category: "Theme" },
  { name: "MonitorIcon", component: MonitorIcon, category: "Theme" },
  /* Media */
  { name: "PlayIcon", component: PlayIcon, category: "Media" },
  { name: "PauseIcon", component: PauseIcon, category: "Media" },
  { name: "StopIcon", component: StopIcon, category: "Media" },
  { name: "MicIcon", component: MicIcon, category: "Media" },
  { name: "MicOffIcon", component: MicOffIcon, category: "Media" },
  { name: "Volume2Icon", component: Volume2Icon, category: "Media" },
  { name: "VolumeXIcon", component: VolumeXIcon, category: "Media" },
  { name: "ImageIcon", component: ImageIcon, category: "Media" },
  { name: "CameraIcon", component: CameraIcon, category: "Media" },
  /* Communication */
  { name: "PhoneIcon", component: PhoneIcon, category: "Communication" },
  { name: "MessageCircleIcon", component: MessageCircleIcon, category: "Communication" },
  { name: "SendIcon", component: SendIcon, category: "Communication" },
  { name: "BellIcon", component: BellIcon, category: "Communication" },
  { name: "BellOffIcon", component: BellOffIcon, category: "Communication" },
  { name: "MailIcon", component: MailIcon, category: "Communication" },
  /* Objects */
  { name: "HomeIcon", component: HomeIcon, category: "Objects" },
  { name: "CalendarIcon", component: CalendarIcon, category: "Objects" },
  { name: "ClockIcon", component: ClockIcon, category: "Objects" },
  { name: "StarIcon", component: StarIcon, category: "Objects" },
  { name: "HeartIcon", component: HeartIcon, category: "Objects" },
  { name: "BookmarkIcon", component: BookmarkIcon, category: "Objects" },
  { name: "FilterIcon", component: FilterIcon, category: "Objects" },
  { name: "LockIcon", component: LockIcon, category: "Objects" },
  { name: "UnlockIcon", component: UnlockIcon, category: "Objects" },
  { name: "GlobeIcon", component: GlobeIcon, category: "Objects" },
  { name: "LinkIcon", component: LinkIcon, category: "Objects" },
  { name: "MapPinIcon", component: MapPinIcon, category: "Objects" },
  { name: "TagIcon", component: TagIcon, category: "Objects" },
  { name: "ClipboardIcon", component: ClipboardIcon, category: "Objects" },
  { name: "ShieldIcon", component: ShieldIcon, category: "Objects" },
  { name: "FlagIcon", component: FlagIcon, category: "Objects" },
  { name: "AwardIcon", component: AwardIcon, category: "Objects" },
  /* Development */
  { name: "CodeIcon", component: CodeIcon, category: "Development" },
  { name: "TerminalIcon", component: TerminalIcon, category: "Development" },
  { name: "FileIcon", component: FileIcon, category: "Development" },
  { name: "FileTextIcon", component: FileTextIcon, category: "Development" },
  { name: "FolderIcon", component: FolderIcon, category: "Development" },
  { name: "DatabaseIcon", component: DatabaseIcon, category: "Development" },
  { name: "GitBranchIcon", component: GitBranchIcon, category: "Development" },
  { name: "ZapIcon", component: ZapIcon, category: "Development" },
  /* People */
  { name: "UserIcon", component: UserIcon, category: "People" },
  { name: "UsersIcon", component: UsersIcon, category: "People" },
  { name: "UserPlusIcon", component: UserPlusIcon, category: "People" },
  { name: "UserMinusIcon", component: UserMinusIcon, category: "People" },
  /* Layout / UI */
  { name: "GridIcon", component: GridIcon, category: "Layout" },
  { name: "ListIcon", component: ListIcon, category: "Layout" },
  { name: "LayoutIcon", component: LayoutIcon, category: "Layout" },
  { name: "MaximizeIcon", component: MaximizeIcon, category: "Layout" },
  { name: "MinimizeIcon", component: MinimizeIcon, category: "Layout" },
  { name: "SlidersIcon", component: SlidersIcon, category: "Layout" },
  { name: "ColumnsIcon", component: ColumnsIcon, category: "Layout" },
  { name: "MenuIcon", component: MenuIcon, category: "Layout" },
  /* Shapes / Preference */
  { name: "CircleIcon", component: CircleIcon, category: "Shapes" },
  { name: "SquareIcon", component: SquareIcon, category: "Shapes" },
  { name: "ContrastIcon", component: ContrastIcon, category: "Shapes" },
  { name: "LayersIcon", component: LayersIcon, category: "Shapes" },
  /* Commerce */
  { name: "ShoppingCartIcon", component: ShoppingCartIcon, category: "Commerce" },
  { name: "CreditCardIcon", component: CreditCardIcon, category: "Commerce" },
  { name: "PackageIcon", component: PackageIcon, category: "Commerce" },
  /* Social / Interaction */
  { name: "ThumbsUpIcon", component: ThumbsUpIcon, category: "Social" },
  { name: "ThumbsDownIcon", component: ThumbsDownIcon, category: "Social" },
  { name: "SmileIcon", component: SmileIcon, category: "Social" },
  { name: "FrownIcon", component: FrownIcon, category: "Social" },
  /* Misc */
  { name: "LoaderIcon", component: LoaderIcon, category: "Misc" },
  { name: "ExternalLinkIcon", component: ExternalLinkIcon, category: "Misc" },
  { name: "SettingsIcon", component: SettingsIcon, category: "Misc" },
  { name: "HashIcon", component: HashIcon, category: "Misc" },
  { name: "AtSignIcon", component: AtSignIcon, category: "Misc" },
  { name: "PaperclipIcon", component: PaperclipIcon, category: "Misc" },
  { name: "WifiIcon", component: WifiIcon, category: "Misc" },
  { name: "MoreHorizontalIcon", component: MoreHorizontalIcon, category: "Misc" },
  { name: "MoreVerticalIcon", component: MoreVerticalIcon, category: "Misc" },
  { name: "PrintIcon", component: PrintIcon, category: "Misc" },
];

const categories = [...new Set(icons.map((i) => i.category))];

function IconCard({ entry }: { entry: IconEntry }) {
  const Comp = entry.component;
  return (
    <div className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-card-hover transition-all group min-w-0">
      <Comp size="lg" className="text-neutral-700 group-hover:text-primary-600 transition-colors" />
      <Text as="span" size="xs" color="muted" className="font-mono text-center leading-tight w-full truncate">
        {entry.name}
      </Text>
    </div>
  );
}

export default function IconsShowcase() {
  const [search, setSearch] = useState("");

  const filtered = search
    ? icons.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.category.toLowerCase().includes(search.toLowerCase()),
      )
    : icons;

  const filteredCategories = categories.filter((cat) =>
    filtered.some((i) => i.category === cat),
  );

  return (
    <div className="space-y-10">
      {/* Search */}
      <section>
        <div className="max-w-md">
          <Input
            placeholder="Search icons..."
            leftAddon={<SearchIcon size="sm" />}
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
        </div>
        <Text className="mt-2">
          {filtered.length} icon{filtered.length !== 1 ? "s" : ""} across{" "}
          {filteredCategories.length} categor{filteredCategories.length !== 1 ? "ies" : "y"}
        </Text>
      </section>

      {/* Sizes */}
      <section>
        <Heading level={2}>Sizes</Heading>
        <Text>
          All icons support five sizes via the <Code>size</Code> prop: xs, sm, md, lg, xl.
        </Text>
        <div className="flex flex-wrap items-end gap-3 sm:gap-6 mt-4">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <StarIcon size={size} className="text-neutral-700" />
              <Text as="span" size="xs" color="muted" className="font-mono">{size}</Text>
            </div>
          ))}
        </div>
      </section>

      {/* Styling */}
      <section>
        <Heading level={2}>Styling</Heading>
        <Text>
          Icons inherit <Code>currentColor</Code> for stroke color. Use Tailwind text color utilities via <Code>className</Code>.
        </Text>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-4">
          <HeartIcon size="lg" className="text-danger-500" />
          <StarIcon size="lg" className="text-warning-500" />
          <CheckCircleIcon size="lg" className="text-success-500" />
          <InfoIcon size="lg" className="text-info-500" />
          <ZapIcon size="lg" className="text-accent-500" />
          <CodeIcon size="lg" className="text-primary-500" />
        </div>
      </section>

      {/* Icon Grid by Category */}
      {filteredCategories.map((cat) => (
        <section key={cat}>
          <Heading level={2}>{cat}</Heading>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 mt-4">
            {filtered
              .filter((i) => i.category === cat)
              .map((entry) => (
                <IconCard key={entry.name} entry={entry} />
              ))}
          </div>
        </section>
      ))}

      {/* Usage */}
      <section>
        <Heading level={2}>Usage</Heading>
        <Text>
          All icons are royalty-free SVG React components based on the Lucide icon set (MIT license).
          They render stroke-based SVGs at a 24×24 viewBox with configurable <Code>size</Code>, accessibility <Code>label</Code>,
          and <Code>className</Code> props.
        </Text>
        <div className="mt-4">
          <CodeBlock
            code={`import { HeartIcon, StarIcon } from "composite-voice-ui";

// Basic usage
<HeartIcon size="md" />

// With color
<StarIcon size="lg" className="text-warning-500" />

// Accessible (adds role="img" + aria-label)
<HeartIcon size="md" label="Favorite" />`}
            language="tsx"
            title="Icon Usage"
          />
        </div>
      </section>
    </div>
  );
}
