import boto3
from app.core.config import settings

client = boto3.client("sns", aws_access_key_id=settings.AWS_ACCESS_KEY_ID, aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY, region_name=settings.AWS_REGION)

def send_otp(phone: str, otp: str):
    """
    Send OTP to a phone number.
    
    Args:
        phone: Phone number to send OTP to
        otp: OTP to send
    """
    try:
        client.publish(
            PhoneNumber=phone,
            Message=f"Your OTP for Neura-AI is {otp}. It will expire in 10 minutes.",
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional"
                }
            }
        )
        return {"success": True, "message": "SMS sent successfully"}
    except Exception as e:  
        print(f"[ERROR] Failed to send SMS: {e}")   
        return {"success": False, "message": "Failed to send SMS"}