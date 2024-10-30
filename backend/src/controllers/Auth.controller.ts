import type { Request, Response } from "express";
import type { Date, ObjectId } from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

import User from "../models/UserModel";
import {
  signUpValidation,
  signInValidation,
  forgotPasswordValidation,
} from "../validations/authValidations";
import {
  sendSuccessResponse,
  sendErrorResponse,
  generateEmailVerificationToken,
  generateTokenAndSetCookie,
  generateResetPasswordToken,
} from "../utils";
import {
  sendVerificationToken,
  successfulVerificationEmail,
  resetPasswordEmail,
} from "../../configs/NodeMailer/SendEmail";

dotenv.config();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 1 * 60 * 60 * 1000;

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = signUpValidation.safeParse(req.body);

    if (!result.success) {
      sendErrorResponse(res, "Incorrect Format", 400, {
        errors: result.error.errors,
      });
      return;
    }

    const { username, email, password } = result.data;

    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      sendErrorResponse(res, "Email already exists");
      return;
    }

    const existingUserByUsername = await User.findOne({ username });
    if (existingUserByUsername) {
      sendErrorResponse(res, "Username already exists");
      return;
    }

    const saltRounds: number = parseInt(process.env.SALT_ROUNDS || "10", 10);
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const emailVerificationToken = generateEmailVerificationToken();

    const newUser = new User({
      email,
      password: hashedPassword,
      username,
      emailVerificationToken,
      emailVerificationTokenExpiresAt: new Date(Date.now() + FIFTEEN_MINUTES),
    });

    await newUser.save();

    sendVerificationToken(
      newUser.username,
      newUser.email,
      emailVerificationToken
    );

    sendSuccessResponse(res, "User created successfully", {
      user: {
        ...newUser.toObject(),
        password: undefined,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    sendErrorResponse(res, message, 500);
    console.error("Error during signUp:", error);
  }
};

export const verifyEmail = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { emailCode } = req.body;

  try {
    const user = await User.findOne({
      emailVerificationToken: emailCode,
      emailVerificationTokenExpiresAt: { $gt: Date.now() },
    });

    if (!user) {
      sendErrorResponse(res, "Invalid or expired verification code");
      return;
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpiresAt = undefined;
    await user.save();

    await successfulVerificationEmail(user.username, user.email);

    sendSuccessResponse(res, "Email verified successfully", {
      user: {
        ...user.toObject(),
        password: undefined,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    sendErrorResponse(res, message, 500);
    console.error("Error during email verification:", error);
  }
};

export const signin = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = signInValidation.safeParse(req.body);

    if (!result.success) {
      sendErrorResponse(res, "Incorrect Format", 400, {
        errors: result.error.errors,
      });
      return;
    }

    const { email, password } = result.data;

    const user = await User.findOne({ email });

    const dummyPassword = "dummyPasswordForComparison"; // This is just a placeholder

    if (!user) {
      await bcrypt.compare(password, dummyPassword); // To avoid revealing whether the user exists
      sendErrorResponse(res, "Invalid credentials");
      return;
    }

    const matchPass = await bcrypt.compare(password, user.password);
    if (!matchPass) {
      sendErrorResponse(res, "Invalid credentials");
      return;
    }

    const token = generateTokenAndSetCookie(res, user._id as ObjectId);

    user.lastLogin = new Date();
    await user.save();

    sendSuccessResponse(res, "SignIn successful", {
      token,
      user: {
        ...user.toObject(),
        password: undefined,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    sendErrorResponse(res, message, 500);
    console.error("Error during signIn:", error);
  }
};

export const signout = async (req: Request, res: Response): Promise<void> => {
  try {
    res.clearCookie("authToken");
    sendSuccessResponse(res, "Sign Out successful");
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred";
    sendErrorResponse(res, message, 500);
    console.error("Error during sign out:", error);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = forgotPasswordValidation.safeParse(req.body);

    if (!result.success) {
      sendErrorResponse(res, "Incorrect Format", 400, {
        errors: result.error.errors,
      });
      return;
    }

    const { email } = result.data;

    const user = await User.findOne({ email });

    if (!user) {
      sendSuccessResponse(
        res,
        "If this email is registered, a reset link will be sent."
      );
      return;
    }

    user.resetPasswordToken = generateResetPasswordToken();
    user.resetPasswordTokenExpiresAt = new Date(Date.now() + ONE_HOUR);

    await user.save();

    await resetPasswordEmail(
      user.username,
      user.email,
      `${process.env.CLIENT_URL}/reset-password/${user.resetPasswordToken}`
    );

    sendSuccessResponse(
      res,
      "If this email is registered, a reset link will be sent."
    );
    
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred";
    sendErrorResponse(res, message, 500);
    console.error("Error while reseting password:", error);
  }
};
