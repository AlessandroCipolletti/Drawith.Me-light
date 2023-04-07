import Params from 'main/Params'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity'
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity'


let S3

const initS3 = () => {
  S3 = new S3Client({
    credentials: fromCognitoIdentityPool({
      client: new CognitoIdentityClient({ region: Params.s3Region }),
      identityPoolId: Params.s3IdentityPoolId,
    }),
    region: Params.s3Region,
  })
}

export const deleteS3File = async(fileKey, bucket, logError = false) => {
  let result = false

  try {
    !S3 && initS3()
    console.time(`DELETE ${fileKey}`)
    await S3.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: fileKey,
    }))
    console.timeEnd(`DELETE ${fileKey}`)
    result = true
  } catch (error) {
    console.timeEnd(`DELETE ${fileKey}`)
    if (logError) {
      console.log(`ERROR delete S3 file : ${error}`)
    }
  }

  return result
}

export const uploadS3TextFile = async(fileKey, bucket, content, logError = true) => {
  let result = false

  try {
    !S3 && initS3()
    console.time(`UPLOAD ${fileKey}`)
    await S3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Body: content,
    }))
    console.timeEnd(`UPLOAD ${fileKey}`)
    result = true
  } catch (error) {
    console.timeEnd(`UPLOAD ${fileKey}`)
    if (logError) {
      console.log('ERROR upload S3 text file:', error)
    }
  }

  return result
}

export const getS3TextFile = async(fileKey, bucket, logError = true) => {
  let result = ''

  try {
    !S3 && initS3()
    console.time(`GET ${fileKey}`)
    const res = await S3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey,
    }))
    result = await (new Response(res.Body, { headers: { 'Content-Type': 'text/plain' } }).text())
    console.timeEnd(`GET ${fileKey}`)
  } catch (error) {
    console.timeEnd(`GET ${fileKey}`)
    if (logError) {
      console.log('ERROR get S3 text file:', error)
    }
  }

  return result
}
