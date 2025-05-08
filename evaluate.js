import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg'
const LANGUAGE = 'en-GB'
const SAMPLE_RATE = 16000
const MEDIA_ENCODING_FORMAT = 'pcm'
const OUTPUT_DIR = 'output'
const RESULTS_FILE = 'results.txt'
const SUPPORTED_AUDIO_FORMATS = ['wav', 'mp3', 'm4a', 'mp4', 'flac', 'ogg']

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR)
}

async function* audioStreamGenerator(filePath) {
  const stream = fs.createReadStream(filePath, { highWaterMark: 4096 }) // Increased chunk size for stability
  for await (const chunk of stream) {
    yield { AudioEvent: { AudioChunk: new Uint8Array(chunk) } }
  }
}

async function transcribeAudio(filePath) {
  try {
    const client = new TranscribeStreamingClient({
      region: '',
      credentials: {
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
      },
    })

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: LANGUAGE,
      MediaEncoding: MEDIA_ENCODING_FORMAT,
      MediaSampleRateHertz: SAMPLE_RATE,
      AudioStream: audioStreamGenerator(filePath),
    })

    let transcript = ''
    const response = await client.send(command)

    for await (const event of response.TranscriptResultStream) {
      const results = event.TranscriptEvent.Transcript.Results
      for (const result of results) {
        if (!result.IsPartial) {
          transcript += result.Alternatives[0].Transcript + ' '
        }
      }
    }

    return transcript.trim()
  } catch (error) {
    console.error('Error during transcription:', error.message)
    return null
  }
}

function calculateMetrics(referencePath, hypothesisPath) {
  try {
    const command = `asr-eval --original "${referencePath}" --generated "${hypothesisPath}" --wer true --wil true --distance true --stats true --textcomparison true --removewhitespaces true --lowercase true`
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' })
    return output
  } catch (error) {
    const output = error.stdout
      ? error.stdout.toString()
      : error.stderr.toString()
    if (output) {
      return output
    } else {
      console.error('Error calculating metrics:', error.message)
      return null
    }
  }
}

async function processFiles(audioDir, referenceDir) {
  const resultStream = fs.createWriteStream(RESULTS_FILE, { flags: 'a' })

  // Find audio files with supported formats
  const audioFiles = fs
    .readdirSync(audioDir)
    .filter(file =>
      SUPPORTED_AUDIO_FORMATS.includes(
        path.extname(file).slice(1).toLowerCase()
      )
    )

  for (const file of audioFiles) {
    const baseName = path.parse(file).name
    const originalAudioPath = path.join(audioDir, file)
    const referencePath = path.join(referenceDir, `${baseName}.txt`)
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.txt`)

    console.log(`Processing: ${file}`)

    // Convert and ensure compatibility
    const audioPath = ensureAudioCompatibility(originalAudioPath)
    if (!audioPath) {
      console.error(`Skipping file due to conversion error: ${file}`)
      continue
    }

    try {
      const transcript = await transcribeAudio(audioPath)
      if (transcript) {
        fs.writeFileSync(outputPath, transcript)
        console.log(`Transcription completed: ${outputPath}`)

        if (!fs.existsSync(referencePath)) {
          console.warn(`Warning: Reference file not found: ${referencePath}`)
          continue
        }

        const evaluationOutput = calculateMetrics(referencePath, outputPath)
        if (evaluationOutput) {
          const resultString = `File: ${baseName}\n${evaluationOutput}\n`
          resultStream.write(resultString)
          console.log(`Results for ${file}:\n${resultString}`)
        } else {
          console.error(`Failed to calculate metrics for ${file}`)
        }
      } else {
        console.error(`Failed to transcribe ${file}`)
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message)
    }
  }

  resultStream.end()
}

function ensureAudioCompatibility(inputPath) {
  const dir = path.dirname(inputPath)
  const ext = path.extname(inputPath).slice(1).toLowerCase() // Get file extension
  const baseName = path.basename(inputPath, path.extname(inputPath)) // Handle any extension
  const convertedPath = path.join(dir, `${baseName}.wav`)
  const olderDir = path.join(dir, 'older')

  try {
    console.log(`Checking audio file format: ${inputPath}`)

    // If the file is already a WAV file, check its compatibility
    if (ext === 'wav') {
      const ffmpegCheckCommand = `${FFMPEG_PATH} -i "${inputPath}" -f null - 2>&1`
      const ffmpegOutput = execSync(ffmpegCheckCommand, { encoding: 'utf-8' })

      if (
        ffmpegOutput.includes('pcm_s16le') &&
        ffmpegOutput.includes('16000 Hz') &&
        ffmpegOutput.includes('mono')
      ) {
        console.log(`Audio file is already compatible: ${inputPath}`)
        return inputPath
      }
    }

    // Create the older folder if it doesn't exist
    if (!fs.existsSync(olderDir)) {
      fs.mkdirSync(olderDir, { recursive: true })
    }

    // Convert non-WAV or incompatible WAV files to the desired format
    console.log(`Converting incompatible or non-WAV audio file: ${inputPath}`)
    const convertCommand = `${FFMPEG_PATH} -y -i "${inputPath}" -ac 1 -ar 16000 -f wav -acodec pcm_s16le "${convertedPath}"`
    execSync(convertCommand, { stdio: 'inherit' })

    // Move the original file to the older folder
    const movedPath = path.join(olderDir, path.basename(inputPath))
    fs.renameSync(inputPath, movedPath)
    console.log(`Moved original file to: ${movedPath}`)

    // Rename converted file to the original name but with .wav extension
    fs.renameSync(convertedPath, path.join(dir, `${baseName}.wav`))
    console.log(`Renamed converted file to: ${baseName}.wav`)

    return path.join(dir, `${baseName}.wav`)
  } catch (error) {
    console.error(`Error processing audio file: ${inputPath}`, error.message)
    return null
  }
}

async function main() {
  const audioDir = process.argv[2]
  const referenceDir = process.argv[3]

  if (!audioDir || !referenceDir) {
    console.error('Usage: node evaluate.js <audio_dir> <reference_dir>')
    process.exit(1)
  }

  const resolvedAudioDir = path.resolve(audioDir)
  const resolvedReferenceDir = path.resolve(referenceDir)

  if (
    !fs.existsSync(resolvedAudioDir) ||
    !fs.existsSync(resolvedReferenceDir)
  ) {
    console.error(
      'Error: One or both of the specified directories do not exist.'
    )
    process.exit(1)
  }

  console.log(`Using audio directory: ${resolvedAudioDir}`)
  console.log(`Using reference directory: ${resolvedReferenceDir}`)

  await processFiles(resolvedAudioDir, resolvedReferenceDir)
}

main()
