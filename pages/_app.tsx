import type { AppProps } from 'next/app';
import '../styles/globals.css'; // 这里可能需要先创建 globals.css 或者从删掉的 app 里搬回来

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
