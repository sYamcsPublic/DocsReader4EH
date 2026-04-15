import wave
import struct

def create_silent_wav(filename="silent.wav", duration_sec=10, sample_rate=44100):
    # モノラル、2バイト(16bit)、サンプリングレート44100Hzで設定
    with wave.open(filename, 'wb') as wav_file:
        wav_file.setnchannels(1) 
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        
        # 無音（値が0）のデータを作成
        n_frames = int(duration_sec * sample_rate)
        for _ in range(n_frames):
            data = struct.pack('<h', 0)
            wav_file.writeframesraw(data)
    
    print(f"Created: {filename} ({duration_sec} seconds)")

if __name__ == "__main__":
    create_silent_wav()
