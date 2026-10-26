
export interface Asset {
  src: string;
  type: "image";
  origin: "upload" | "url";
}

export type SubjectDetection = {
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number | null;
  landmarks?: any;
  type: 'face' | 'person';
};

export type DetectionResult = {
  subjects: SubjectDetection[];
  primary?: SubjectDetection;
};

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
}

export function selectPrimary(subjects: SubjectDetection[]): SubjectDetection {
  return [...subjects].sort((a, b) => {
    const areaA = a.bbox.w * a.bbox.h;
    const areaB = b.bbox.w * b.bbox.h;
    return areaB - areaA;
  })[0];
}

export function cropSubject(img: HTMLImageElement, bbox: { x: number; y: number; w: number; h: number }) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;

  // bbox is normalized (0-1000)
  const realX = (bbox.x / 1000) * img.width;
  const realY = (bbox.y / 1000) * img.height;
  const realW = (bbox.w / 1000) * img.width;
  const realH = (bbox.h / 1000) * img.height;

  canvas.width = realW;
  canvas.height = realH;

  ctx.drawImage(
    img,
    realX,
    realY,
    realW,
    realH,
    0,
    0,
    realW,
    realH
  );

  return canvas.toDataURL("image/jpeg");
}

export function autoAssign(asset: Asset, detection: DetectionResult) {
  if (!detection.primary) return "manual";

  const areaRatio =
    (detection.primary.bbox.w * detection.primary.bbox.h) / (1000 * 1000);

  if (areaRatio > 0.25) return "TARGET_SUBJECT";
  return "MAIN_SCENE";
}
