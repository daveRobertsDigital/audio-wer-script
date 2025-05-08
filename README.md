# Realtime AWS Transcription WER/WIR Analysis Script

## Overview

This script analyzes the accuracy of real-time transcriptions from AWS Transcribe by calculating Word Error Rate (WER) and Word Information Lost Rate (WIR). The script compares AWS transcription outputs against original reference scripts to generate accuracy metrics.

## Prerequisites

### Dependencies

Install the required npm packages:

```
npm install speech-recognition-evaluation
npm install @aws-sdk/client-transcribe-streaming
npm install -g speech-recognition-evaluation
```

### System Requirements

Ensure `ffmpeg` is installed on your system for audio file conversion. You can download and install `ffmpeg` from the [official website](https://ffmpeg.org/download.html).

### AWS Credentials

Add your AWS credentials to the `TranscribeStreamingClient` configuration:

```
region: '',
credentials: {
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
}
```

### Custom Dictionary (Optional)

If you want to use a custom dictionary for transcription analysis, ensure it is available in your AWS account. Add the dictionary to the `StartStreamTranscriptionCommand` as follows:

```
VocabularyName: 'name-of-dictionary-here',
```

## Usage

1. Place your audio and script files in the following directories in the same location as the script:

   * `audio_files`
   * `original_scripts`

2. Ensure files have matching names (e.g., `1.wav` and `1.txt`).

3. Run the script:

```
node evaluate.js ./audio_files ./original_scripts
```

If the audio file format is incompatible, it will be automatically converted using `ffmpeg`.

## Output

* Transcription results are saved in the `output` folder.
* A summary of total results is stored in `results.txt` in the same directory as the script.