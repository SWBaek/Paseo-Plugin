import type {
  DashboardDiscoveryResult,
  DashboardDiscoveryStatus,
  DashboardHealth,
  DashboardSnapshot,
} from "./tailscale-dashboard.shared";

export type DashboardViewStatus = DashboardDiscoveryStatus | "loading";
export type DashboardTone = "neutral" | "success" | "warning" | "danger";

const COPY: Record<DashboardViewStatus, { title: string; description: string }> = {
  loading: {
    title: "Dashboard를 확인하는 중",
    description: "Tailscale 연결과 HTTPS Serve mapping을 읽기 전용으로 조사합니다.",
  },
  available: {
    title: "Dashboard 사용 가능",
    description: "TailscaleOps의 핵심 상태를 Paseo 안에 표시합니다.",
  },
  not_found: {
    title: "Dashboard를 찾지 못함",
    description: "이 Host에 현재 DNS 이름과 일치하는 HTTPS Serve mapping이 없습니다.",
  },
  multiple: {
    title: "Dashboard 후보가 여러 개임",
    description: "잘못된 내부 서비스를 열지 않도록 자동 선택하지 않았습니다. Serve 구성을 확인하세요.",
  },
  tailscale_unavailable: {
    title: "Tailscale CLI를 사용할 수 없음",
    description: "선택한 Host에 Tailscale CLI가 설치되어 있고 실행 경로에 있는지 확인하세요.",
  },
  tailscale_disconnected: {
    title: "Tailscale이 연결되지 않음",
    description: "선택한 Host를 Tailnet에 연결한 뒤 다시 확인하세요.",
  },
  command_failed: {
    title: "Tailscale 상태 확인 실패",
    description: "선택한 Host에서 Tailscale 상태와 Serve 구성을 확인한 뒤 다시 시도하세요.",
  },
  verification_failed: {
    title: "Dashboard 응답을 검증하지 못함",
    description: "Serve backend가 실행 중이고 TailscaleOps 상태 API를 제공하는지 확인하세요.",
  },
  verification_timeout: {
    title: "Dashboard 확인 시간 초과",
    description: "Serve backend 상태와 로컬 방화벽을 확인한 뒤 다시 시도하세요.",
  },
};

export function discoveryCopy(status: DashboardViewStatus) {
  return { status, ...COPY[status] };
}

export function discoveryTone(
  status: DashboardDiscoveryStatus,
  health: DashboardHealth | null,
): DashboardTone {
  if (status === "available") {
    return health === "healthy" ? "success" : health === "warning" ? "warning" : "danger";
  }
  if (
    status === "multiple" ||
    status === "tailscale_disconnected" ||
    status === "verification_timeout"
  ) {
    return "warning";
  }
  return "danger";
}

export function canOpenDashboard(result: DashboardDiscoveryResult): boolean {
  return result.status === "available" && result.url !== null;
}

export function visiblePeers(
  peers: DashboardSnapshot["peers"],
  expanded: boolean,
  compact: boolean,
): DashboardSnapshot["peers"] {
  if (expanded) {
    return peers;
  }
  return peers.slice(0, compact ? 8 : 12);
}
