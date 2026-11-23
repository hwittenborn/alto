import { mediaAssets } from '../../../media/assets';
import FrameWindow from '../../../media/FrameWindow';

export default function FramePage() {
  return <FrameWindow assets={mediaAssets()} />;
}
