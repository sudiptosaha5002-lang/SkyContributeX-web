import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ensureDir = async (path: string) => {
  const exists = await RNFS.exists(path);
  if (!exists) await RNFS.mkdir(path);
};

export const getPrivateDir = async () => {
  const base = RNFS.DocumentDirectoryPath;
  const proofs = `${base}/proofs`;
  const signatures = `${base}/signatures`;
  const exports = `${base}/exports`;
  await Promise.all([ensureDir(proofs), ensureDir(signatures), ensureDir(exports)]);
  return { base, proofs, signatures, exports };
};

export const saveImageProof = async (uri: string) => {
  const { proofs } = await getPrivateDir();
  const resized = await ImageResizer.createResizedImage(uri, 1280, 1280, 'JPEG', 80, 0, proofs, false, {
    onlyScaleDown: true,
  });
  const dest = `${proofs}/proof_${uuidv4()}.jpg`;
  await RNFS.copyFile(resized.uri, dest);
  const stat = await RNFS.stat(dest);
  if (Number(stat.size) > MAX_FILE_SIZE_BYTES) {
    await RNFS.unlink(dest);
    throw new Error('File exceeds 5MB limit after compression.');
  }
  return dest;
};

export const savePdfProof = async (uri: string) => {
  const { proofs } = await getPrivateDir();
  const dest = `${proofs}/proof_${uuidv4()}.pdf`;
  await RNFS.copyFile(uri, dest);
  const stat = await RNFS.stat(dest);
  if (Number(stat.size) > MAX_FILE_SIZE_BYTES) {
    await RNFS.unlink(dest);
    throw new Error('File exceeds 5MB limit.');
  }
  return dest;
};

export const saveSignatureImage = async (base64Png: string) => {
  const { signatures } = await getPrivateDir();
  const dest = `${signatures}/sign_${uuidv4()}.png`;
  await RNFS.writeFile(dest, base64Png.replace('data:image/png;base64,', ''), 'base64');
  return dest;
};
