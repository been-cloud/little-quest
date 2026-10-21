export async function pixelateImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MB');

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法读取这张图片'));
      img.src = url;
    });
    const small = document.createElement('canvas');
    small.width = small.height = 48;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('浏览器不支持图片处理');
    const side = Math.min(image.width, image.height);
    ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 48, 48);
    const pixels = ctx.getImageData(0, 0, 48, 48);
    for (let i = 0; i < pixels.data.length; i += 4) {
      // A compact fixed palette produces cleaner sprite-like blocks than blur.
      for (let channel = 0; channel < 3; channel++) {
        const value = pixels.data[i + channel];
        pixels.data[i + channel] = Math.min(255, Math.round(value / 32) * 32);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    const output = document.createElement('canvas');
    output.width = output.height = 192;
    const outputCtx = output.getContext('2d');
    if (!outputCtx) throw new Error('浏览器不支持图片处理');
    outputCtx.imageSmoothingEnabled = false;
    outputCtx.drawImage(small, 0, 0, 192, 192);
    return output.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
