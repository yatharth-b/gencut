import { SocketProvider } from '../context/SocketContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <SocketProvider>
      <Component {...pageProps} />
    </SocketProvider>
  );
}

export default MyApp;
