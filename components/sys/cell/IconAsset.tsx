export type IconAssetName =
  | "bubble"
  | "cardDots"
  | "collectbox"
  | "ip"
  | "logo"
  | "profile"
  | "search"
  | "setting"
  | "verification";

const iconSources: Record<IconAssetName, string> = {
  bubble: "/icons/bubble.svg",
  cardDots: "/icons/card-dots.svg",
  collectbox: "/icons/collectbox.svg",
  ip: "/icons/ip.svg",
  logo: "/icons/logo.svg",
  profile: "/icons/profile.svg",
  search: "/icons/search.svg",
  setting: "/icons/setting.svg",
  verification: "/icons/verification.svg",
};

export function IconAsset(props: {
  name: IconAssetName;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const size = props.size ?? 24;
  return (
    <img
      alt={props.alt ?? ""}
      aria-hidden={props.alt ? undefined : true}
      className={props.className}
      draggable={false}
      height={size}
      src={iconSources[props.name]}
      width={size}
    />
  );
}
