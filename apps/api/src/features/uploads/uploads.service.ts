import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../infra/lib/storage";

export const UploadsService = {
  async generatePresignedPut(userId: string, _contentType: string) {
    const bucket = process.env.R2_BUCKET_NAME!;

    const key = `avatars/${userId}.webp`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "image/webp",
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

    return { url, publicUrl };
  },

  async generateProjectAttachmentPresignedPut(
    organizationId: string,
    projectId: string,
    fileId: string,
    contentType: string,
  ) {
    const bucket = process.env.R2_BUCKET_NAME!;
    const key = `projects/${organizationId}/${projectId}/${fileId}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

    return { url, publicUrl };
  },

  async deleteProjectAttachment(organizationId: string, projectId: string, fileId: string) {
    const bucket = process.env.R2_BUCKET_NAME!;
    const key = `projects/${organizationId}/${projectId}/${fileId}`;

    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return s3Client.send(command);
  },
};
